import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { runCli } from "../src/knowledge-loom/cli.ts";
import { asRecord, copyFixture, PACKAGE_ROOT, temporaryDirectory } from "./helpers.ts";

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, "-c", "user.name=Example", "-c", "user.email=example@example.com", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function devices(t: TestContext) {
  const root = temporaryDirectory(t);
  const remote = path.join(root, "remote.git");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  const a = copyFixture("single-proactive", path.join(root, "a"));
  const contract = path.join(a, "KNOWLEDGE_VAULT.md");
  fs.writeFileSync(contract, fs.readFileSync(contract, "utf8").replace("type: none", "type: git").replace("sync:\n  mode: none", "sync:\n  mode: git-remote-push\n  inbound:\n    mode: fast-forward\n    remote: origin\n    branch: main"));
  git(a, "init", "--initial-branch=main"); git(a, "add", "."); git(a, "commit", "-m", "Initial");
  git(a, "remote", "add", "origin", remote); git(a, "push", "-u", "origin", "main");
  const b = path.join(root, "b"); git(root, "clone", remote, b);
  git(b, "config", "user.name", "Example"); git(b, "config", "user.email", "example@example.com");
  return { root, remote, a, b, state: path.join(root, "state") };
}
async function invoke(cwd: string, state: string, extra: string[] = [], now = 1_800_000_000_000) {
  let stdout = ""; let stderr = "";
  const code = await runCli(["sync", "--state-dir", state, "--json", ...extra], { cwd, now: () => now, stdout: { write(v) { stdout += v; } }, stderr: { write(v) { stderr += v; } } });
  assert.equal(code, 0, stderr);
  return asRecord(JSON.parse(stdout));
}
function commit(root: string, file: string, content: string) {
  fs.writeFileSync(path.join(root, file), content); git(root, "add", file); git(root, "commit", "-m", `Update ${file}`);
}
test("offline sync remains pending across invocations while local commits remain usable, then publishes after recovery", async (t) => {
  const { b, remote, state } = devices(t);
  commit(b, "local.md", "# Local contribution\n");
  fs.renameSync(remote, `${remote}.offline`);
  const failed = await invoke(b, state);
  assert.equal(failed.status, "pending"); assert.equal(failed.failure, "transport");
  commit(b, "next.md", "# Unrelated next work\n");
  const status = await invoke(b, state, ["--status"]);
  assert.equal(status.status, "pending");
  assert.equal(fs.readFileSync(path.join(b, "local.md"), "utf8"), "# Local contribution\n");
  fs.renameSync(`${remote}.offline`, remote);
  const recovered = await invoke(b, state, [], 1_800_000_300_000);
  assert.equal(recovered.status, "synchronized");
  assert.equal(git(remote, "rev-parse", "main"), git(b, "rev-parse", "HEAD"));
});

test("non-fast-forward bypasses a fresh daily observation and preserves both devices in isolated semantic review", async (t) => {
  const { a, b, state, root, remote } = devices(t);
  let observed = "";
  assert.equal(await runCli(["access", "--state-dir", state, "--json"], { cwd: b, now: () => 1_800_000_000_000, stdout: { write(v) { observed += v; } } }), 0);
  assert.equal(asRecord(JSON.parse(observed)).status, "current");
  commit(a, "remote.md", "# Independent remote contribution\n"); git(a, "push");
  commit(b, "local.md", "# Independent local contribution\n");
  const before = git(b, "rev-parse", "HEAD");
  const pending = await invoke(b, state);
  assert.equal(pending.status, "needs-reconciliation");
  assert.equal(pending.failure, "non-fast-forward");
  assert.equal(git(b, "rev-parse", "HEAD"), before);
  assert.equal(fs.existsSync(path.join(b, ".git", "MERGE_HEAD")), false);
  const evidence = asRecord(pending.evidence);
  assert.equal(evidence.ours, before);
  assert.equal(evidence.theirs, git(a, "rev-parse", "HEAD"));
  assert.match(JSON.stringify(evidence), /Independent remote contribution/);
  const resolution = path.join(root, "resolution.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Both independent source-backed contributions remain valid.", files: [] }));
  const published = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(published.status, "synchronized");
  assert.equal(fs.readFileSync(path.join(b, "remote.md"), "utf8"), "# Independent remote contribution\n");
  assert.equal(fs.readFileSync(path.join(b, "local.md"), "utf8"), "# Independent local contribution\n");
  assert.equal(git(remote, "rev-parse", "main"), git(b, "rev-parse", "HEAD"));
});

test("overlapping edits resolve from three-way evidence while unresolved facts leave ordinary commits usable", async (t) => {
  const { a, b, state, root } = devices(t);
  commit(a, "fact.md", "# Schedule\nLaunch: Monday\n"); git(a, "push"); git(b, "pull", "--ff-only");
  commit(a, "fact.md", "# Schedule\nLaunch: Tuesday\nRemote source: signed approval\n"); git(a, "push");
  commit(b, "fact.md", "# Schedule\nLaunch: Wednesday\nLocal source: draft proposal\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "The source evidence is not yet sufficient to choose a launch date.", question: "Does the signed approval supersede the Wednesday draft proposal?" }));
  const question = await invoke(b, state, ["--resolution", resolution]);
  assert.match(String(question.question), /signed approval/);
  assert.equal(fs.existsSync(path.join(b, ".git", "MERGE_HEAD")), false);
  // Once authoritative evidence resolves the fact, retain the losing proposal as history.
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Signed approval establishes Tuesday; retain the local draft as history.", files: [{ path: "fact.md", content: "# Schedule\nLaunch: Tuesday\nSource: signed approval\nEarlier proposal: Wednesday (draft)\n" }] }));
  const resolved = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(resolved.status, "synchronized");
  assert.match(fs.readFileSync(path.join(b, "fact.md"), "utf8"), /Earlier proposal: Wednesday/);
  commit(b, "next.md", "# Unrelated work\n");
});

test("a textually clean factual contradiction requires semantic review before publication", async (t) => {
  const { a, b, state, remote } = devices(t);
  commit(a, "approved.md", "# Current launch\nLaunch date: Tuesday\n"); git(a, "push");
  commit(b, "current.md", "# Current launch\nLaunch date: Wednesday\n");
  const remoteHead = git(remote, "rev-parse", "main");
  const pending = await invoke(b, state);
  assert.equal(pending.status, "needs-reconciliation");
  assert.match(JSON.stringify(pending.evidence), /Tuesday/);
  assert.match(JSON.stringify(pending.evidence), /Wednesday/);
  assert.equal(git(remote, "rev-parse", "main"), remoteHead);
});

test("stale resolution preserves subsequent local commits and dirty user edits", async (t) => {
  const { a, b, state, root } = devices(t);
  commit(a, "remote.md", "# Remote\n"); git(a, "push");
  commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Independent contributions.", files: [] }));
  commit(b, "next.md", "# Subsequent commit\n");
  fs.writeFileSync(path.join(b, "working.md"), "Unfinished edit\n");
  const head = git(b, "rev-parse", "HEAD");
  const stale = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(stale.status, "pending"); assert.match(String(stale.reason), /stale/);
  assert.equal(git(b, "rev-parse", "HEAD"), head);
  assert.equal(fs.readFileSync(path.join(b, "working.md"), "utf8"), "Unfinished edit\n");
});

test("an unresolved textual conflict cannot pass as a clean semantic resolution", async (t) => {
  const { a, b, state, root } = devices(t);
  commit(a, "fact.md", "# Fact\nA\n"); git(a, "push"); git(b, "pull", "--ff-only");
  commit(a, "fact.md", "# Fact\nB\n"); git(a, "push");
  commit(b, "fact.md", "# Fact\nC\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "No file resolution provided.", files: [] }));
  const result = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(result.status, "needs-reconciliation");
  assert.match(String(result.reason), /unresolved/);
});

test("sync repairs only missing matching upstream metadata without fetching before a successful push", async (t) => {
  const { b, state, remote } = devices(t);
  git(b, "config", "--unset", "branch.main.remote"); git(b, "config", "--unset", "branch.main.merge");
  git(b, "config", "remote.origin.uploadpack", "false");
  commit(b, "local.md", "# Offline-authored contribution\n");
  const result = await invoke(b, state);
  assert.equal(result.status, "synchronized");
  assert.equal(result.repair, "restored-authorized-upstream");
  assert.equal(git(remote, "rev-parse", "main"), git(b, "rev-parse", "HEAD"));
});

test("authentication failure retains pending state without fetching or reconciling", async (t) => {
  const { b, state } = devices(t);
  git(b, "config", "remote.origin.receivepack", "printf 'Permission denied (publickey).' >&2; exit 1;");
  git(b, "config", "remote.origin.uploadpack", "false");
  commit(b, "local.md", "# Keep local\n");
  const result = await invoke(b, state);
  assert.equal(result.status, "pending"); assert.equal(result.failure, "authentication");
  assert.equal(result.workspace, undefined); assert.equal(result.evidence, undefined);
});

test("repeated push races stop after one publication attempt and retain new evidence", async (t) => {
  const { a, b, state, root } = devices(t);
  commit(a, "remote.md", "# Remote\n"); git(a, "push"); commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Independent contributions.", files: [] }));
  const hook = path.join(b, ".git", "hooks", "pre-push");
  const counter = path.join(root, "push-count");
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(hook, `#!/bin/sh\necho attempt >> ${quote(counter)}\necho '# Racing addition' > ${quote(path.join(a, "race.md"))}\ngit -C ${quote(a)} add race.md\ngit -C ${quote(a)} -c user.name=Example -c user.email=example@example.com commit -m Race\ngit -C ${quote(a)} push\n`, { mode: 0o755 });
  const raced = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(raced.status, "needs-reconciliation");
  assert.equal(fs.readFileSync(counter, "utf8"), "attempt\n");
  assert.match(JSON.stringify(raced.evidence), /Racing addition/);
  assert.equal(fs.existsSync(path.join(b, ".git", "MERGE_HEAD")), false);
});

test("rewritten and unrelated remote histories retain local work without publication", async (t) => {
  for (const observed of [true, false]) {
    const { a, b, state } = devices(t);
    if (observed) assert.equal(await runCli(["access", "--state-dir", state, "--json"], { cwd: b, stdout: { write() {} } }), 0);
    commit(b, "local.md", "# Local\n");
    git(a, "checkout", "--orphan", "replacement"); git(a, "add", "."); git(a, "commit", "-m", "Replacement history"); git(a, "push", "--force", "origin", "HEAD:main");
    const before = git(b, "rev-parse", "HEAD");
    const result = await invoke(b, state);
    assert.equal(result.status, "pending"); assert.equal(result.recovery_required, true);
    assert.equal(git(b, "rev-parse", "HEAD"), before);
    assert.equal(fs.existsSync(path.join(b, ".git", "MERGE_HEAD")), false);
  }
});

test("candidate audit failure preserves both revisions and blocks publication", async (t) => {
  const { a, b, state, root, remote } = devices(t);
  commit(a, "remote.md", "# Remote\n"); git(a, "push"); commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Preserve both contributions with an added project note.", files: [{ path: "Projects/new.md", content: "# Missing required metadata\n" }] }));
  const result = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(result.status, "needs-reconciliation"); assert.equal(result.validated, false);
  assert.equal(git(remote, "rev-parse", "main"), evidence.theirs);
  assert.equal(git(b, "rev-parse", "HEAD"), evidence.ours);
});

test("interrupted publication keeps durable pending state and the surviving writer lock", async (t) => {
  const { b, state, root } = devices(t);
  commit(b, "local.md", "# Local\n");
  const marker = path.join(root, "push-ready"); const release = path.join(root, "release");
  const script = path.join(root, "receive-pack");
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(script, `#!/bin/sh\nprintf ready > ${quote(marker)}\nwhile [ ! -f ${quote(release)} ]; do sleep 0.05; done\nexec git-receive-pack "$@"\n`, { mode: 0o755 });
  git(b, "config", "remote.origin.receivepack", quote(script));
  const owner = spawn(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "sync", b, "--state-dir", state, "--json"], { cwd: PACKAGE_ROOT, stdio: "ignore" });
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(marker), true);
    owner.kill("SIGKILL"); await exited;
    const pending = await invoke(b, state, ["--status"]);
    assert.equal(pending.status, "pending");
    assert.equal((await invoke(b, state)).status, "busy");
  } finally { fs.writeFileSync(release, "release"); owner.kill("SIGKILL"); }
  const deadline = Date.now() + 10_000;
  let recovered;
  do { recovered = await invoke(b, state); } while (recovered.status === "busy" && Date.now() < deadline);
  assert.equal(recovered.status, "synchronized");
});

test("a commit made during push stays pending instead of inheriting an older publication success", async (t) => {
  const { b, state, remote } = devices(t);
  commit(b, "local.md", "# Local\n");
  const published = git(b, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(b, ".git", "hooks", "pre-push"), "#!/bin/sh\necho '# Concurrent edit' > concurrent.md\ngit add concurrent.md\ngit commit -m Concurrent\n", { mode: 0o755 });
  const result = await invoke(b, state);
  assert.equal(git(remote, "rev-parse", "main"), published);
  assert.equal(result.status, "pending"); assert.equal(result.synchronized, false);
  const status = await invoke(b, state, ["--status"]);
  assert.equal(status.status, "pending");
});

test("inbound authentication failure is classified and retains a bounded retry observation", async (t) => {
  const { b, state } = devices(t);
  git(b, "config", "remote.origin.uploadpack", "printf 'Permission denied (publickey).' >&2; exit 1;");
  let output = "";
  assert.equal(await runCli(["access", "--state-dir", state, "--json"], { cwd: b, stdout: { write(v) { output += v; } }, now: () => 1_800_000_000_000 }), 0);
  const result = asRecord(JSON.parse(output));
  assert.equal(asRecord(result.observed).failure, "authentication");
  assert.equal(asRecord(result.observed).retry_at, 1_800_000_300_000);
});

test("concurrent user edits during candidate audit prevent application", async (t) => {
  const { a, b, state, root } = devices(t);
  const contract = path.join(a, "KNOWLEDGE_VAULT.md");
  fs.writeFileSync(contract, fs.readFileSync(contract, "utf8").replace("instruction_roots:", "content_checks:\n  adapter: fictional-check\ninstruction_roots:"));
  git(a, "add", "KNOWLEDGE_VAULT.md"); git(a, "commit", "-m", "Declare checker"); git(a, "push"); git(b, "pull", "--ff-only");
  const checker = path.join(root, "checker.cjs");
  fs.writeFileSync(checker, `const fs=require('node:fs'); if(process.cwd().includes('reconcile-')) fs.writeFileSync(${JSON.stringify(path.join(b, "concurrent.md"))},'Unfinished user work\\n'); console.log(JSON.stringify({status:'pass',root:process.cwd(),validationDate:'2026-09-08',findings:[]}));`);
  const registry = path.join(root, "registry.json");
  fs.writeFileSync(registry, JSON.stringify({ schema_version: 1, vaults: {}, content_check_adapters: { "fictional-check": { executable: process.execPath, arguments: [checker] } } }));
  commit(a, "remote.md", "# Remote\n"); git(a, "push"); commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state, ["--registry", registry]);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Both contributions are independent.", files: [] }));
  const result = await invoke(b, state, ["--registry", registry, "--resolution", resolution]);
  assert.equal(result.status, "pending"); assert.match(String(result.reason), /changed during audit/);
  assert.equal(git(b, "rev-parse", "HEAD"), evidence.ours);
  assert.equal(fs.readFileSync(path.join(b, "concurrent.md"), "utf8"), "Unfinished user work\n");
});

test("remote rewind after evidence preparation is detected before applying the candidate", async (t) => {
  const { a, b, state, root, remote } = devices(t);
  const base = git(a, "rev-parse", "HEAD");
  commit(a, "remote.md", "# Remote\n"); git(a, "push"); commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  git(a, "push", "--force", "origin", `${base}:main`);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Independent contributions.", files: [] }));
  const result = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(result.status, "pending"); assert.equal(result.recovery_required, true);
  assert.equal(git(b, "rev-parse", "HEAD"), evidence.ours);
  assert.equal(git(remote, "rev-parse", "main"), base);
});

test("interrupted candidate application keeps the surviving Git writer protected", async (t) => {
  const { a, b, state, root } = devices(t);
  commit(a, ".gitattributes", "remote.dat filter=delayed\n"); git(a, "push"); git(b, "pull", "--ff-only");
  commit(a, "remote.dat", "Remote bytes\n"); git(a, "push"); commit(b, "local.md", "# Local\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  const resolution = path.join(root, "decision.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: evidence.ours, theirs: evidence.theirs, rationale: "Independent contributions.", files: [] }));
  const marker = path.join(root, "apply-ready"); const release = path.join(root, "release-apply");
  const script = path.join(root, "smudge");
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(script, `#!/bin/sh\nprintf ready > ${quote(marker)}\nwhile [ ! -f ${quote(release)} ]; do sleep 0.05; done\ncat\n`, { mode: 0o755 });
  git(b, "config", "filter.delayed.smudge", quote(script));
  const owner = spawn(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "sync", b, "--state-dir", state, "--resolution", resolution, "--json"], { cwd: PACKAGE_ROOT, stdio: "ignore" });
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(marker), true);
    owner.kill("SIGKILL"); await exited;
    assert.equal((await invoke(b, state)).status, "busy");
    assert.equal((await invoke(b, state, ["--status"])).status, "pending");
  } finally { fs.writeFileSync(release, "release"); owner.kill("SIGKILL"); }
  // Wait for the protected application before temporary fixture cleanup.
  const deadline = Date.now() + 10_000;
  let result;
  do { result = await invoke(b, state); } while (result.status === "busy" && Date.now() < deadline);
  assert.equal(result.status, "synchronized");
});

test("a new unaudited revision cannot inherit the prior validated state", async (t) => {
  const { b, state } = devices(t);
  assert.equal((await invoke(b, state)).validated, true);
  commit(b, "Projects/invalid.md", "# Missing metadata\n");
  const result = await invoke(b, state, ["--status"]);
  assert.equal(result.status, "pending"); assert.equal(result.validated, false);
  fs.writeFileSync(path.join(b, "unfinished.md"), "Working\n");
  assert.equal((await invoke(b, state)).validated, false);
});

test("bounded packets allow completion after explicit review of all larger source versions", async (t) => {
  const { a, b, state, root } = devices(t);
  const longNote = "# Remote reference\n" + "A sourced detail retained with its context.\n".repeat(80);
  commit(a, "long.md", longNote); git(a, "push"); commit(b, "local.md", "# Independent local contribution\n");
  const pending = await invoke(b, state);
  const evidence = asRecord(pending.evidence);
  assert.equal(evidence.truncated, true);
  assert.ok(JSON.stringify(evidence).length < 8192);
  const resolution = path.join(root, "decision.json");
  const decision = { base: evidence.base, ours: evidence.ours, theirs: evidence.theirs, rationale: "Reviewed all source versions in bounded reads; preserve both independent contributions.", files: [] };
  fs.writeFileSync(resolution, JSON.stringify(decision));
  const missing = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(missing.status, "needs-reconciliation");
  fs.writeFileSync(resolution, JSON.stringify({ ...decision, reviewed_files: ["local.md", "long.md"] }));
  const result = await invoke(b, state, ["--resolution", resolution]);
  assert.equal(result.status, "synchronized");
  assert.equal(fs.readFileSync(path.join(b, "long.md"), "utf8"), longNote);
});
