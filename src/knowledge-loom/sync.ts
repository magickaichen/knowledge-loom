import { classifyFailure } from "./remote-failure.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { operationInProgress, upstreamProblem, validateAuthority } from "./access.js";
import { auditVault } from "./audit.js";
import { isUnknownRecord, loadVault } from "./contract.js";
import { canonicalPath, isWithin, resolveVaultPath } from "./pathing.js";
import { atomicWriteText } from "./registry.js";
import { runLockedProcess, withVaultLock } from "./vault-lock.js";
import type { LoadedVault, UnknownRecord } from "./types.js";

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed`);
  return result.stdout.trim();
}
interface SyncOptions {
  stateDir?: string | undefined;
  registryPath?: string | undefined;
  resolution?: string | undefined;
  statusOnly?: boolean;
  now?: () => number;
}

/** Explicit post-commit entry point; it adds no authority for local writes or provider backup. */
export async function synchronizeVault(vault: LoadedVault, options: SyncOptions = {}): Promise<UnknownRecord & { status: string }> {
  validateAuthority(vault);
  const sync = isUnknownRecord(vault.contract.sync) ? vault.contract.sync : {};
  const inbound = isUnknownRecord(sync.inbound) ? sync.inbound : {};
  if (sync.mode !== "git-remote-push") return { status: "not-enabled" };
  if (typeof inbound.remote !== "string" || typeof inbound.branch !== "string") return { status: "pending", reason: "configure an authorized inbound destination before synchronization" };
  const { remote, branch } = inbound;
  const localBranch = git(vault.root, "symbolic-ref", "--short", "HEAD");
  const url = git(vault.root, "remote", "get-url", "--", remote);
  // A different push URL could publish private knowledge to an unauthorized destination.
  if (git(vault.root, "remote", "get-url", "--push", "--all", "--", remote) !== url) return { status: "pending", reason: "push destination differs from the authorized inbound destination" };
  const key = createHash("sha256").update(JSON.stringify([vault.root, localBranch, remote, url, branch])).digest("hex");
  const directory = canonicalPath(options.stateDir ?? path.join(os.homedir(), ".local", "state", "knowledge-loom"));
  const common = canonicalPath(git(vault.root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  if (isWithin(vault.root, directory) || isWithin(common, directory)) throw new Error("operational state must stay outside the vault and its Git directory");
  const file = path.join(directory, `sync-${key}.json`);
  const read = (): UnknownRecord => {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) return {};
    if (!stat.isFile() || stat.size > 262144) throw new Error("invalid pending state; preserve and inspect it");
    const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isUnknownRecord(value) || value.schema_version !== 1) throw new Error("invalid pending state; preserve and inspect it");
    return value;
  };
  if (options.statusOnly) {
    const state = read();
    const head = git(vault.root, "rev-parse", "HEAD");
    const current = state.published_revision === head;
    return { ...state, status: state.status === "synchronized" && !current ? "pending" : String(state.status ?? "unverified"), synchronized: state.synchronized === true && current, head, state_file: file };
  }
  const locked = await withVaultLock(vault.root, async (trackWriter) => {
    let state = read();
    const save = (fields: UnknownRecord) => {
      state = { ...state, schema_version: 1, root: vault.root, ...fields };
      atomicWriteText(file, `${JSON.stringify(state)}\n`);
      return { ...state, status: String(state.status), state_file: file };
    };
    let head = git(vault.root, "rev-parse", "HEAD");
    const unchanged = () => git(vault.root, "rev-parse", "HEAD") === head
      && git(vault.root, "symbolic-ref", "--short", "HEAD") === localBranch
      && !upstreamProblem(vault.root, remote, branch)
      && git(vault.root, "remote", "get-url", "--", remote) === url
      && git(vault.root, "remote", "get-url", "--push", "--all", "--", remote) === url
      && JSON.stringify(loadVault(vault.root).contract) === JSON.stringify(vault.contract)
      && !operationInProgress(vault.root) && !git(vault.root, "status", "--porcelain", "--untracked-files=all");
    const run = async (root: string, args: string[]) => {
      let output = ""; let error = "";
      const code = await runLockedProcess(root, "git", args, trackWriter, {
        timeoutMs: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
        stdout: { write(v) { output = (output + v).slice(0, 65536); } }, stderr: { write(v) { error = (error + v).slice(0, 65536); } },
      });
      return { code, output, error };
    };
    if (options.resolution) {
      const evidence = isUnknownRecord(state.evidence) ? state.evidence : {};
      if (state.status !== "needs-reconciliation" || evidence.ours !== head || typeof state.workspace !== "string" || !unchanged()) return save({ status: "pending", reason: "reconciliation is stale; rerun sync for current evidence" });
      const stat = fs.lstatSync(options.resolution);
      if (!stat.isFile() || stat.size > 262144) throw new Error("resolution must be a bounded JSON file");
      const decision: unknown = JSON.parse(fs.readFileSync(options.resolution, "utf8"));
      if (!isUnknownRecord(decision) || decision.ours !== evidence.ours || decision.theirs !== evidence.theirs || typeof decision.rationale !== "string" || !decision.rationale.trim()) throw new Error("resolution requires exact ours/theirs revisions and evidence-based rationale");
      if (typeof decision.question === "string" && decision.question.trim()) return save({ status: "needs-reconciliation", question: decision.question, reason: decision.rationale });
      if (evidence.truncated === true) return save({ status: "pending", reason: "evidence exceeds automatic bounds; scoped evidence review is required" });
      if (!Array.isArray(decision.files)) throw new Error("resolution requires a files list");
      const workspace = canonicalPath(state.workspace);
      if (!isWithin(directory, workspace) || workspace === directory) throw new Error("invalid reconciliation workspace");
      if (git(workspace, "rev-parse", "HEAD") !== head) return save({ status: "pending", reason: "candidate revision changed; prepare new evidence" });
      for (const item of decision.files) {
        if (!isUnknownRecord(item) || typeof item.path !== "string" || (item.content !== null && typeof item.content !== "string") || item.path.split("/").some((part) => part.toLowerCase() === ".git")) throw new Error("invalid resolution file");
        const target = resolveVaultPath(workspace, item.path);
        if (!target) throw new Error("resolution path crosses workspace boundary");
        if (item.content === null) fs.rmSync(target, { force: true });
        else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, item.content); }
      }
      const conflicts = git(workspace, "diff", "--name-only", "--diff-filter=U", "-z").split("\0").filter(Boolean);
      const resolvedPaths = decision.files.filter(isUnknownRecord).map((item) => item.path);
      if (conflicts.some((file) => !resolvedPaths.includes(file))) return save({ status: "needs-reconciliation", reason: "unresolved textual conflicts require explicit file resolutions" });
      for (const file of conflicts) {
        const target = resolveVaultPath(workspace, file);
        if (target && fs.existsSync(target) && /^(?:<{7}|={7}|>{7})(?: |$)/m.test(fs.readFileSync(target, "utf8"))) return save({ status: "needs-reconciliation", reason: "unresolved conflict markers remain" });
      }
      git(workspace, "add", "--all");
      const candidateVault = loadVault(workspace);
      validateAuthority(candidateVault);
      if (JSON.stringify(candidateVault.contract) !== JSON.stringify(vault.contract)) return save({ status: "pending", reason: "candidate changes governing contract; review authority separately" });
      const candidateTree = git(workspace, "write-tree");
      const candidateStatus = git(workspace, "status", "--porcelain", "--untracked-files=all");
      const findings = await auditVault(candidateVault, { registryPath: options.registryPath });
      if (findings.some((item) => item.severity === "error")) return save({ status: "needs-reconciliation", validated: false, reason: "candidate audit failed", findings });
      if (git(workspace, "write-tree") !== candidateTree || git(workspace, "diff", "--name-only") || git(workspace, "status", "--porcelain", "--untracked-files=all") !== candidateStatus || !unchanged()) return save({ status: "pending", reason: "checkout or candidate changed during audit" });
      git(workspace, "-c", `core.hooksPath=${os.devNull}`, "commit", "-m", "Reconcile source-backed knowledge contributions");
      const candidate = git(workspace, "rev-parse", "HEAD");
      save({ status: "pending", candidate, validated: true, reason: "audited candidate awaiting application" });
      if ((await run(vault.root, ["fetch", "--no-tags", "--no-write-fetch-head", "--", workspace, candidate])).code !== 0 || !unchanged()) return save({ reason: "checkout changed before application; candidate retained" });
      // Git also checks index/worktree collisions, including ignored local files.
      git(vault.root, "-c", `core.hooksPath=${os.devNull}`, "merge", "--ff-only", "--no-overwrite-ignore", candidate);
      head = candidate;
    }
    save({ status: "pending", head, saved: true, attempted_at: (options.now ?? Date.now)(), synchronized: false, backed_up: "not-run", committed: true });
    if (JSON.stringify(loadVault(vault.root).contract) !== JSON.stringify(vault.contract)) return save({ reason: "authority changed; reread the contract" });
    if (upstreamProblem(vault.root, remote, branch) && localBranch === branch) {
      const settings = [[`branch.${localBranch}.remote`, remote], [`branch.${localBranch}.merge`, `refs/heads/${branch}`]];
      const current = settings.map(([key]) => spawnSync("git", ["-C", vault.root, "config", "--get", key!], { encoding: "utf8" }));
      if (current.every((value, i) => value.status === 1 || (value.status === 0 && value.stdout.trim() === settings[i]![1]))) {
        for (let i = 0; i < settings.length; i++) if (current[i]!.status === 1) git(vault.root, "config", "--local", settings[i]![0]!, settings[i]![1]!);
        save({ repair: "restored-authorized-upstream" });
      }
    }
    const problem = upstreamProblem(vault.root, remote, branch);
    if (problem) return save({ reason: problem });
    if (state.recovery_required === true) return save({ reason: "remote history requires explicit recovery" });
    if (operationInProgress(vault.root) || git(vault.root, "status", "--porcelain", "--untracked-files=all")) return save({ reason: "checkout has unfinished work; commit authorized changes separately before synchronization" });
    const findings = await auditVault(loadVault(vault.root), { registryPath: options.registryPath });
    if (findings.some((item) => item.severity === "error")) return save({ validated: false, reason: "audit failed", findings });
    save({ validated: true });
    if (git(vault.root, "rev-parse", "HEAD") !== head || git(vault.root, "status", "--porcelain", "--untracked-files=all") || operationInProgress(vault.root)) return save({ reason: "checkout changed during audit" });
    if (!unchanged()) return save({ reason: "checkout or authority changed before publication" });
    const { code, output, error } = await run(vault.root, ["push", "--porcelain", "--", remote, `${head}:refs/heads/${branch}`]);
    if (code === 0) {
      const current = unchanged();
      return save({ status: current ? "synchronized" : "pending", synchronized: current, published_revision: head, failure: null, reason: current ? null : "published audited revision; newer local work remains pending" });
    }
    const rejected = /^!\t[^\n]+\t\[rejected\] \((?:fetch first|non-fast-forward)\)/m.test(output)
      || (/^!\t[^\n]+\t\[remote rejected\] \(failed to update ref\)/m.test(output) && /cannot lock ref .*is at [a-f0-9]+ but expected [a-f0-9]+/.test(error));
    const failure = rejected ? "non-fast-forward" : classifyFailure(error);
    if (rejected) {
      save({ failure, reason: "non-fast-forward; fetching current remote evidence" });
      const ref = `refs/knowledge-loom/sync/${key}`;
      const fetched = await run(vault.root, ["fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--refmap=", "--", remote, `+refs/heads/${branch}:${ref}`]);
      if (fetched.code !== 0) return save({ failure: classifyFailure(fetched.error), reason: "reconciliation fetch failed; local work remains usable" });
      const theirs = git(vault.root, "rev-parse", ref);
      let previous = typeof state.remote_revision === "string" ? state.remote_revision : undefined;
      const observation = path.join(directory, `${key}.json`);
      if (!previous && fs.existsSync(observation)) {
        const record: unknown = JSON.parse(fs.readFileSync(observation, "utf8"));
        if (isUnknownRecord(record) && typeof record.remote_revision === "string") previous = record.remote_revision;
      }
      if (state.recovery_required === true || (previous && !ancestor(vault.root, previous, theirs))) return save({ status: "pending", recovery_required: true, reason: "remote history was rewritten; explicit recovery required" });
      const commonBase = spawnSync("git", ["-C", vault.root, "merge-base", "--all", head, theirs], { encoding: "utf8", timeout: 10_000 });
      const base = commonBase.stdout.trim();
      if (commonBase.status !== 0 || !/^[a-f0-9]{40,64}$/.test(base)) return save({ status: "pending", recovery_required: true, reason: "no unique common ancestor; explicit recovery required" });
      const evidence = evidencePacket(vault.root, base, head, theirs);
      save({ remote_revision: theirs, evidence });
      if (!unchanged()) return save({ status: "pending", reason: "checkout changed while fetching; rerun sync" });
      const workspace = fs.mkdtempSync(path.join(directory, "reconcile-"));
      save({ workspace, status: "pending", reason: "preparing isolated candidate" });
      if ((await run(directory, ["clone", "--no-hardlinks", "--no-checkout", "--", vault.root, workspace])).code !== 0) return save({ reason: "could not prepare isolated candidate" });
      git(workspace, "-c", `core.hooksPath=${os.devNull}`, "checkout", "--detach", head);
      for (const field of ["user.name", "user.email"]) git(workspace, "config", field, git(vault.root, "config", "--get", field));
      if ((await run(workspace, ["fetch", "--no-tags", "--", vault.root, ref])).code !== 0) return save({ reason: "could not copy observed revision" });
      const merged = await run(workspace, ["-c", `core.hooksPath=${os.devNull}`, "merge", "--no-commit", "--no-ff", theirs]);
      if (merged.code !== 0 && !fs.existsSync(path.join(workspace, ".git", "MERGE_HEAD"))) return save({ reason: "candidate merge failed; isolated work retained" });
      return save({ status: "needs-reconciliation", reason: "review all three-way evidence for factual consistency, including textually clean merges", question: null });
    }
    return save({ failure, reason: "push failed; local reads, authorized edits and commits remain available" });
  });
  return locked.acquired ? locked.value : { status: "busy", reason: "another task owns the mutation lock; local work is preserved" };
}

function ancestor(root: string, older: string, newer: string): boolean {
  const result = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", older, newer], { timeout: 10_000 });
  if (result.status !== 0 && result.status !== 1) throw new Error("could not compare history");
  return result.status === 0;
}
function evidencePacket(root: string, base: string, ours: string, theirs: string) {
  const changed = [...new Set([ours, theirs].flatMap((revision) => git(root, "diff", "--name-only", "-z", base, revision).split("\0").filter(Boolean)))].sort();
  let truncated = changed.length > 16;
  const files = changed.slice(0, 16).map((file) => {
    const read = (revision: string) => {
      const result = spawnSync("git", ["-C", root, "show", `${revision}:${file}`], { encoding: "utf8", timeout: 10_000, maxBuffer: 8192 });
      if (result.error || result.stdout.length > 2048) truncated = true;
      return result.status === 0 ? result.stdout.slice(0, 2048) : null;
    };
    return { path: file, base: read(base), ours: read(ours), theirs: read(theirs) };
  });
  return { base, ours, theirs, files, truncated, trust: "data-only; timestamps are not factual authority" };
}
