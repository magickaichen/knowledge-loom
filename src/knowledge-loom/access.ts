import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContractError, isUnknownRecord, loadVault, renderContract, validateContractData } from "./contract.js";
import { canonicalPath, isWithin, resolveVaultPath, resolveVaultPatternPrefix } from "./pathing.js";
import { atomicWriteText } from "./registry.js";
import { runLockedProcess, withVaultLock } from "./vault-lock.js";
import type { LoadedVault } from "./types.js";

const DAY = 86_400_000;
const RETRY = 300_000;

function ancestor(root: string, older: string, newer: string): boolean {
  const result = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", older, newer], { timeout: 10_000 });
  if (result.status !== 0 && result.status !== 1) throw new Error("could not compare Git history");
  return result.status === 0;
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed`);
  return result.stdout.trim();
}

function validateAuthority(vault: LoadedVault): void {
  const errors = validateContractData(vault.contract).filter((item) => item.severity === "error");
  if (errors.length) throw new ContractError(`invalid contract: ${errors.map((item) => item.message).join("; ")}`);
  const contract = vault.contract;
  const navigation = isUnknownRecord(contract.navigation) ? contract.navigation : {};
  const files = [contract.instruction_roots, navigation.entrypoints].flatMap((value) => Array.isArray(value) ? value : []);
  const views = isUnknownRecord(contract.focus_views) ? contract.focus_views : {};
  for (const view of Object.values(views)) if (isUnknownRecord(view)) files.push(view.path);
  for (const relative of files) {
    const resolved = resolveVaultPath(vault.root, relative);
    if (!resolved || !fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) throw new ContractError("contract file is missing or crosses the vault boundary");
  }
  const profiles = isUnknownRecord(contract.metadata_profiles) ? contract.metadata_profiles : {};
  const privacy = isUnknownRecord(contract.privacy) ? contract.privacy : {};
  const patterns: unknown[] = Array.isArray(privacy.never_track) ? [...privacy.never_track] : [];
  for (const profile of Object.values(profiles)) if (isUnknownRecord(profile) && Array.isArray(profile.paths)) patterns.push(...profile.paths);
  for (const pattern of patterns) if (!resolveVaultPatternPrefix(vault.root, pattern)) throw new ContractError("contract pattern crosses the vault boundary");
}

function upstreamProblem(root: string, remote: string, branch: string): string | null {
  try {
    if (canonicalPath(git(root, "rev-parse", "--show-toplevel")) !== root) return "automatic access requires a vault at its Git checkout root";
    git(root, "check-ref-format", `refs/heads/${branch}`);
    const local = git(root, "symbolic-ref", "--quiet", "--short", "HEAD");
    if (git(root, "config", "--get", `branch.${local}.remote`) !== remote
      || git(root, "config", "--get", `branch.${local}.merge`) !== `refs/heads/${branch}`) return "current branch upstream differs from authorized inbound remote/branch";
    git(root, "remote", "get-url", "--", remote);
    git(root, "rev-parse", "--verify", "HEAD");
    return null;
  } catch { return "Git repository, remote, branch or upstream is unavailable; configure the authorized upstream before retrying"; }
}

function operationInProgress(root: string): boolean {
  return ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "index.lock"].some((name) =>
    fs.existsSync(path.resolve(root, git(root, "rev-parse", "--git-path", name))));
}

export async function accessVault(vault: LoadedVault, { stateDir, now = Date.now, statusOnly = false }: { stateDir?: string | undefined; now?: () => number; statusOnly?: boolean } = {}) {
  validateAuthority(vault);
  const base = { schema_version: 1, root: vault.root };
  const sync = isUnknownRecord(vault.contract.sync) ? vault.contract.sync : {};
  const inbound = isUnknownRecord(sync.inbound) ? sync.inbound : {};
  if (inbound.mode !== "fast-forward") return { ...base, status: "not-enabled" };
  if (typeof inbound.remote !== "string" || typeof inbound.branch !== "string") throw new Error("inbound requires remote and branch");
  const { remote, branch } = inbound;
  const problem = upstreamProblem(vault.root, remote, branch);
  if (problem) return { ...base, status: "unavailable", reason: problem };
  try {
    if (statusOnly) return await refresh(vault, remote, branch, stateDir, now, true);
    const locked = await withVaultLock(vault.root, (trackWriter) => refresh(vault, remote, branch, stateDir, now, false, trackWriter));
    return locked.acquired ? locked.value : { ...base, status: "busy", reason: "another task owns the vault mutation lock; local work is preserved" };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    return { ...base, status: "unavailable", reason: "access could not complete; inspect repository and observation-state permissions before retrying" };
  }
}

async function refresh(vault: LoadedVault, remote: string, branch: string, stateDir: string | undefined, now: () => number, statusOnly: boolean, trackWriter?: (pid: number, group?: boolean) => void) {
  const base = { schema_version: 1, root: vault.root };
  const currentVault = loadVault(vault.root);
  validateAuthority(currentVault);
  if (JSON.stringify(currentVault.contract.sync) !== JSON.stringify(vault.contract.sync)) return { ...base, status: "unavailable", reason: "inbound authority changed while waiting; reread the contract before retrying" };
  const problem = upstreamProblem(vault.root, remote, branch);
  if (problem) return { ...base, status: "unavailable", reason: problem };
  const url = git(vault.root, "remote", "get-url", "--", remote);
  const localBranch = git(vault.root, "symbolic-ref", "--short", "HEAD");
  const key = createHash("sha256").update(JSON.stringify([vault.root, localBranch, remote, url, branch])).digest("hex");
  const directory = canonicalPath(stateDir ?? path.join(os.homedir(), ".local", "state", "knowledge-loom"));
  const common = canonicalPath(git(vault.root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  if (isWithin(vault.root, directory) || isWithin(common, directory)) throw new ContractError("operational state must stay outside the vault and its Git directory");
  const file = path.join(directory, `${key}.json`);
  const ref = `refs/knowledge-loom/observations/${key}`;
  let previous: unknown = null;
  try {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.size > 16_384)) throw new Error("invalid observation file");
    if (stat) {
      previous = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!isUnknownRecord(previous) || previous.schema_version !== 1) throw new Error("invalid observation format");
      for (const field of ["checked_at", "attempted_at", "retry_at"]) {
        const value = previous[field];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error("invalid observation time");
      }
      if (previous.remote_revision !== undefined && (typeof previous.remote_revision !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(previous.remote_revision))) throw new Error("invalid observation revision");
    }
  } catch {
    return { ...base, status: "unavailable", reason: "observation file is unreadable or invalid; preserve it for inspection and retry with a repaired state directory", state_file: file };
  }
  const observed = isUnknownRecord(previous) ? previous : {};
  const time = now();
  if (statusOnly && typeof observed.retry_at === "number") return { ...base, status: "unavailable", check: "read-only", observed };
  if (statusOnly && typeof observed.remote_revision !== "string") return { ...base, status: "unverified", check: "read-only", observed };
  if (typeof observed.retry_at === "number" && time < observed.retry_at && typeof observed.attempted_at === "number" && time >= observed.attempted_at) {
    return { ...base, status: "unavailable", check: statusOnly ? "read-only" : "backoff", observed };
  }
  const cached = typeof observed.checked_at === "number" && time >= observed.checked_at && time - observed.checked_at < DAY;
  if (!cached && !statusOnly) {
    try {
      if (!trackWriter) throw new Error("remote observation requires a mutation lock");
      const code = await runLockedProcess(vault.root, "git", ["fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--refmap=", "--", remote, `+refs/heads/${branch}:${ref}`], trackWriter, {
        timeoutMs: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      if (code !== 0) throw new Error("remote fetch failed");
    } catch {
      previous = { ...observed, schema_version: 1, attempted_at: time, retry_at: time + RETRY };
      atomicWriteText(file, `${JSON.stringify(previous)}\n`);
      return { ...base, status: "unavailable", check: "failed", observed: previous, reason: "remote fetch failed; local work remains available" };
    }
    const revision = git(vault.root, "rev-parse", "--verify", ref);
    const rewritten = typeof observed.remote_revision === "string" && !ancestor(vault.root, observed.remote_revision, revision);
    previous = { schema_version: 1, attempted_at: time, checked_at: now(), remote_revision: revision, recovery_required: observed.recovery_required === true || rewritten };
    atomicWriteText(file, `${JSON.stringify(previous)}\n`);
  }
  if (isUnknownRecord(previous) && previous.recovery_required === true) return { ...base, status: "recovery-required", check: statusOnly ? "read-only" : cached ? "cached" : "performed", observed: previous, reason: "upstream history changed; reconcile explicitly before resuming automatic integration" };
  const latest = loadVault(vault.root);
  validateAuthority(latest);
  if (git(vault.root, "symbolic-ref", "--short", "HEAD") !== localBranch
    || git(vault.root, "remote", "get-url", "--", remote) !== url
    || upstreamProblem(vault.root, remote, branch)
    || JSON.stringify(latest.contract.sync) !== JSON.stringify(currentVault.contract.sync)) {
    return { ...base, status: "unavailable", reason: "checkout or inbound authority changed during observation; retry access on the intended branch", observed: previous };
  }
  const head = git(vault.root, "rev-parse", "HEAD");
  const revision = isUnknownRecord(previous) && typeof previous.remote_revision === "string" ? previous.remote_revision : "";
  if (!revision) return { ...base, status: "unverified", check: statusOnly ? "read-only" : "cached", observed: previous };
  let status = "current";
  if (head !== revision) {
    if (ancestor(vault.root, revision, head)) status = "ahead";
    else if (!ancestor(vault.root, head, revision)) status = "diverged";
    else if (statusOnly || operationInProgress(vault.root) || git(vault.root, "status", "--porcelain", "--untracked-files=all")) status = "behind";
    else {
      try {
        git(vault.root, "-c", `core.hooksPath=${os.devNull}`, "merge", "--ff-only", "--no-overwrite-ignore", revision);
        status = "integrated";
      } catch { status = "behind"; }
      if (status === "integrated") validateAuthority(loadVault(vault.root));
    }
  }
  const localRevision = git(vault.root, "rev-parse", "HEAD");
  if (!statusOnly && isUnknownRecord(previous)) {
    const updated = { ...previous, integration_status: status, local_revision: localRevision };
    if (JSON.stringify(updated) !== JSON.stringify(previous)) atomicWriteText(file, `${JSON.stringify(updated)}\n`);
    previous = updated;
  }
  return { ...base, status, check: statusOnly ? "read-only" : cached ? "cached" : "performed", observed: previous, head: localRevision, state_file: file };
}

export async function configureInbound(vault: LoadedVault, remote: string, branch: string, apply: boolean) {
  validateAuthority(vault);
  if (!remote || remote.startsWith("-") || /[\s\0]/.test(remote)) throw new Error("a configured remote name is required");
  const check = spawnSync("git", ["-C", vault.root, "check-ref-format", `refs/heads/${branch}`], { encoding: "utf8" });
  if (!branch || check.status !== 0) throw new Error("a valid remote branch is required");
  const configured = spawnSync("git", ["-C", vault.root, "remote", "get-url", "--", remote], { encoding: "utf8" });
  if (configured.status !== 0) throw new Error("remote is not configured; configure it before enabling inbound access");
  const sync = isUnknownRecord(vault.contract.sync) ? vault.contract.sync : {};
  const contract = { ...vault.contract, sync: { ...sync, inbound: { mode: "fast-forward", remote, branch } } };
  const errors = validateContractData(contract).filter((item) => item.severity === "error");
  if (errors.length) throw new Error(errors.map((item) => item.message).join("; "));
  const rendered = renderContract(contract, vault.body);
  if (apply) {
    const before = fs.readFileSync(vault.contractPath, "utf8");
    const locked = await withVaultLock(vault.root, async () => {
      validateAuthority(loadVault(vault.root));
      if (fs.readFileSync(vault.contractPath, "utf8") !== before) throw new Error("contract changed while waiting; preview again");
      atomicWriteText(vault.contractPath, rendered);
    });
    if (!locked.acquired) throw new Error("another writer owns the vault; preview again after it finishes");
  }
  return { schema_version: 1, root: vault.root, status: apply ? "configured" : "preview", contract: rendered };
}
