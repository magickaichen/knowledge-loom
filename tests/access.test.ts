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
  fs.writeFileSync(contract, fs.readFileSync(contract, "utf8").replace("type: none", "type: git"));
  git(a, "init", "--initial-branch=main");
  git(a, "add", ".");
  git(a, "commit", "-m", "Initial vault");
  git(a, "remote", "add", "origin", remote);
  git(a, "push", "-u", "origin", "main");
  const b = path.join(root, "b");
  git(root, "clone", remote, b);
  return { root, remote, a, b, state: path.join(root, "state") };
}

async function invoke(args: string[], cwd: string, now = 1_800_000_000_000) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd, now: () => now, stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } },
  });
  return { code, stdout, stderr, now };
}

async function enabledDevices(t: TestContext) {
  const setup = devices(t);
  const result = await invoke(["access", "--enable-inbound", "--remote", "origin", "--branch", "main", "--apply", "--json"], setup.a);
  assert.equal(result.code, 0, result.stderr);
  git(setup.a, "add", "KNOWLEDGE_VAULT.md"); git(setup.a, "commit", "-m", "Enable inbound"); git(setup.a, "push");
  git(setup.b, "pull", "--ff-only");
  return setup;
}

test("access without an applicable vault is a successful no-op without operational state", async (t) => {
  const root = temporaryDirectory(t);
  const state = path.join(root, "state");
  const result = await invoke(["access", "--registry", path.join(root, "registry.yaml"), "--state-dir", state, "--json"], root);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "not-applicable");
  assert.equal(fs.existsSync(state), false);
});

test("access fast-forwards due knowledge and reuses the observation until exactly 24 hours", async (t) => {
  const { a, b, state } = devices(t);
  const enabled = await invoke(["access", "--enable-inbound", "--remote", "origin", "--branch", "main", "--apply", "--json"], a);
  assert.equal(enabled.code, 0, enabled.stderr);
  git(a, "add", "KNOWLEDGE_VAULT.md");
  git(a, "commit", "-m", "Enable inbound");
  git(a, "push");
  git(b, "pull", "--ff-only");
  fs.writeFileSync(path.join(a, "new.md"), "# New knowledge\n");
  git(a, "add", "new.md"); git(a, "commit", "-m", "Add knowledge"); git(a, "push");
  const args = ["access", "--state-dir", state, "--json"];
  const first = await invoke(args, b);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(asRecord(JSON.parse(first.stdout)).status, "integrated");
  assert.equal(fs.readFileSync(path.join(b, "new.md"), "utf8"), "# New knowledge\n");
  fs.writeFileSync(path.join(a, "later.md"), "# Later knowledge\n");
  git(a, "add", "later.md"); git(a, "commit", "-m", "Later knowledge"); git(a, "push");
  const cached = await invoke(args, b, first.now + 86_399_999);
  assert.equal(asRecord(JSON.parse(cached.stdout)).check, "cached");
  assert.equal(fs.existsSync(path.join(b, "later.md")), false);
  const due = await invoke(args, b, first.now + 86_400_000);
  assert.equal(asRecord(JSON.parse(due.stdout)).status, "integrated");
  assert.equal(fs.existsSync(path.join(b, "later.md")), true);
});

test("enabling inbound access previews the exact contract and only applies on request", async (t) => {
  const { b, state } = devices(t);
  const contract = path.join(b, "KNOWLEDGE_VAULT.md");
  const original = fs.readFileSync(contract, "utf8");
  const args = ["access", "--enable-inbound", "--remote", "origin", "--branch", "main", "--state-dir", state, "--json"];
  const preview = await invoke(args, b);
  assert.equal(preview.code, 0, preview.stderr);
  const rendered = asRecord(JSON.parse(preview.stdout)).contract;
  assert.equal(typeof rendered, "string");
  assert.match(String(rendered), /inbound:/);
  assert.equal(fs.readFileSync(contract, "utf8"), original);
  const applied = await invoke([...args, "--apply"], b);
  assert.equal(applied.code, 0, applied.stderr);
  assert.equal(fs.readFileSync(contract, "utf8"), rendered);
  assert.equal(fs.existsSync(state), false);
});

test("a dirty reader observes remote changes without integrating them or losing unfinished work", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  fs.writeFileSync(path.join(a, "remote.md"), "# Remote addition\n");
  git(a, "add", "remote.md"); git(a, "commit", "-m", "Remote addition"); git(a, "push");
  fs.writeFileSync(path.join(b, "unfinished.md"), "# Unfinished local work\n");
  const head = git(b, "rev-parse", "HEAD");
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "behind");
  assert.equal(git(b, "rev-parse", "HEAD"), head);
  assert.equal(fs.readFileSync(path.join(b, "unfinished.md"), "utf8"), "# Unfinished local work\n");
  assert.equal(fs.existsSync(path.join(b, "remote.md")), false);
});

test("remote failure allows local commits and backs off without claiming a successful check", async (t) => {
  const { a, b, remote, state } = await enabledDevices(t);
  const args = ["access", "--state-dir", state, "--json"];
  fs.renameSync(remote, `${remote}.offline`);
  const failed = await invoke(args, b);
  assert.equal(failed.code, 0, failed.stderr);
  assert.equal(asRecord(JSON.parse(failed.stdout)).status, "unavailable");
  fs.writeFileSync(path.join(b, "local.md"), "# Local work remains possible\n");
  git(b, "add", "local.md"); git(b, "commit", "-m", "Local work");
  fs.renameSync(`${remote}.offline`, remote);
  fs.writeFileSync(path.join(a, "remote.md"), "# Restored remote\n");
  git(a, "add", "remote.md"); git(a, "commit", "-m", "Remote work"); git(a, "push");
  const retry = await invoke(args, b, failed.now + 1);
  assert.equal(asRecord(JSON.parse(retry.stdout)).check, "backoff");
  const recovered = await invoke(args, b, failed.now + 300_000);
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.equal(asRecord(JSON.parse(recovered.stdout)).status, "diverged");
  assert.equal(asRecord(JSON.parse(recovered.stdout)).check, "performed");
  assert.equal(fs.readFileSync(path.join(b, "local.md"), "utf8"), "# Local work remains possible\n");
});

test("concurrent tasks share one due access operation", async (t) => {
  const { b, state } = await enabledDevices(t);
  const args = ["access", "--state-dir", state, "--json"];
  const results = await Promise.all([invoke(args, b), invoke(args, b)]);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(results.map((result) => asRecord(JSON.parse(result.stdout)).check).sort(), ["cached", "performed"]);
});

test("status is read-only even when a cached remote revision could now be integrated", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  fs.writeFileSync(path.join(a, "new.md"), "# Available remotely\n");
  git(a, "add", "new.md"); git(a, "commit", "-m", "Remote work"); git(a, "push");
  const args = ["access", "--state-dir", state, "--json"];
  fs.writeFileSync(path.join(b, "working.md"), "# Working\n");
  await invoke(args, b);
  fs.unlinkSync(path.join(b, "working.md"));
  const before = git(b, "rev-parse", "HEAD");
  const records = fs.readdirSync(state).map((file) => fs.readFileSync(path.join(state, file), "utf8"));
  const status = await invoke([...args, "--status"], b);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(asRecord(JSON.parse(status.stdout)).status, "behind");
  assert.equal(asRecord(JSON.parse(status.stdout)).check, "read-only");
  assert.equal(git(b, "rev-parse", "HEAD"), before);
  assert.deepEqual(fs.readdirSync(state).map((file) => fs.readFileSync(path.join(state, file), "utf8")), records);
  const access = await invoke(args, b);
  assert.equal(asRecord(JSON.parse(access.stdout)).status, "integrated");
  assert.equal(asRecord(JSON.parse(access.stdout)).check, "cached");
});

test("invalid authority and in-vault state paths stop access before a fetch", async (t) => {
  const { b, state } = await enabledDevices(t);
  const contract = path.join(b, "KNOWLEDGE_VAULT.md");
  const original = fs.readFileSync(contract, "utf8");
  fs.writeFileSync(contract, original.replace("- INDEX.md", "- ../outside.md"));
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /boundary|within|contract/);
  assert.equal(fs.existsSync(state), false);
  fs.writeFileSync(contract, original);
  const inside = await invoke(["access", "--state-dir", path.join(b, "state"), "--json"], b);
  assert.equal(inside.code, 2);
  assert.match(inside.stderr, /outside/);
  assert.equal(fs.existsSync(path.join(b, "state")), false);
});

test("access revalidates governing paths after a remote fast-forward", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  const contract = path.join(a, "KNOWLEDGE_VAULT.md");
  fs.writeFileSync(contract, fs.readFileSync(contract, "utf8").replace("- INDEX.md", "- ../outside.md"));
  git(a, "add", "KNOWLEDGE_VAULT.md"); git(a, "commit", "-m", "Invalid remote navigation"); git(a, "push");
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /contract|boundary/);
});

test("a different branch without the authorized upstream cannot inherit a vault refresh", async (t) => {
  const { b, state } = await enabledDevices(t);
  git(b, "switch", "-c", "scratch");
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "unavailable");
  assert.match(String(asRecord(JSON.parse(result.stdout)).reason), /upstream/);
  assert.equal(fs.existsSync(state), false);
});

test("cooperating writers hold the shared lock until they finish", async (t) => {
  const { root, b, state } = await enabledDevices(t);
  const marker = path.join(root, "writer-ready");
  const release = path.join(root, "release-writer");
  const writer = invoke(["with-vault-lock", b, "--", process.execPath, "-e", `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(marker)}, 'ready'); const timer=setInterval(() => { if(fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); } }, 10);`], root);
  const start = Date.now();
  while (!fs.existsSync(marker) && Date.now() - start < 2000) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(marker), true);
  try {
    const busy = await invoke(["access", "--state-dir", state, "--json"], b);
    assert.equal(asRecord(JSON.parse(busy.stdout)).status, "busy");
    assert.equal(fs.existsSync(state), false);
  } finally { fs.writeFileSync(release, "release"); await writer; }
  const recovered = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(asRecord(JSON.parse(recovered.stdout)).check, "performed");
});

test("a rewritten remote is reported for recovery instead of being silently integrated", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  const args = ["access", "--state-dir", state, "--json"];
  const first = await invoke(args, b);
  git(a, "reset", "--hard", "HEAD~1");
  git(a, "push", "--force");
  const result = await invoke(args, b, first.now + 86_400_000);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "recovery-required");
  const repeated = await invoke(args, b, first.now + 86_400_001);
  assert.equal(asRecord(JSON.parse(repeated.stdout)).status, "recovery-required");
});

test("access preserves an in-progress Git operation even with a clean index", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  fs.writeFileSync(path.join(a, "later.md"), "# Later\n");
  git(a, "add", "later.md"); git(a, "commit", "-m", "Later"); git(a, "push");
  const operation = path.join(b, ".git", "rebase-merge");
  fs.mkdirSync(operation);
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "behind");
  assert.equal(fs.existsSync(operation), true);
  assert.equal(fs.existsSync(path.join(b, "later.md")), false);
});

test("a terminated lock owner is recovered without a lease timeout", async (t) => {
  const { b, state } = await enabledDevices(t);
  const crashed = spawnSync(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "with-vault-lock", b, "--", process.execPath, "-e", "const owner=JSON.parse(require('node:child_process').execFileSync('git',['cat-file','blob','refs/knowledge-loom/mutation-lock'],{encoding:'utf8'})); process.kill(owner.pid, 'SIGKILL'); process.exit(0);"], { cwd: PACKAGE_ROOT, encoding: "utf8", timeout: 5000 });
  assert.equal(crashed.signal, "SIGKILL", crashed.stderr);
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).check, "performed");
});

test("status retains a failed check after backoff expires without attempting recovery", async (t) => {
  const { b, remote, state } = await enabledDevices(t);
  fs.renameSync(remote, `${remote}.offline`);
  const args = ["access", "--state-dir", state, "--json"];
  const failed = await invoke(args, b);
  const status = await invoke([...args, "--status"], b, failed.now + 300_001);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(asRecord(JSON.parse(status.stdout)).status, "unavailable");
  assert.equal(asRecord(JSON.parse(status.stdout)).check, "read-only");
});

test("a corrupt observation does not make local knowledge unreadable", async (t) => {
  const { b, state } = await enabledDevices(t);
  const args = ["access", "--state-dir", state, "--json"];
  await invoke(args, b);
  const file = path.join(state, fs.readdirSync(state)[0]!);
  fs.writeFileSync(file, "interrupted data");
  const result = await invoke(args, b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "unavailable");
  assert.match(String(asRecord(JSON.parse(result.stdout)).reason), /observation/);
  assert.equal(fs.readFileSync(file, "utf8"), "interrupted data");
});

test("inbound integration preserves ignored local files that collide with remote additions", async (t) => {
  const { a, b, state } = await enabledDevices(t);
  fs.writeFileSync(path.join(b, ".git", "info", "exclude"), "local.md\n");
  fs.writeFileSync(path.join(b, "local.md"), "PRIVATE LOCAL WORK\n");
  fs.writeFileSync(path.join(a, "local.md"), "REMOTE\n");
  git(a, "add", "local.md"); git(a, "commit", "-m", "Remote addition"); git(a, "push");
  const head = git(b, "rev-parse", "HEAD");
  const result = await invoke(["access", "--state-dir", state, "--json"], b);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(b, "local.md"), "utf8"), "PRIVATE LOCAL WORK\n");
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "behind");
  assert.equal(git(b, "rev-parse", "HEAD"), head);
});

test("separate state directories cannot change the revision a cached observation integrates", async (t) => {
  const { a, b, root, state } = await enabledDevices(t);
  const args = ["access", "--state-dir", state, "--json"];
  await invoke(args, b);
  const head = git(b, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(a, "new.md"), "# Later remote\n");
  git(a, "add", "new.md"); git(a, "commit", "-m", "Later remote"); git(a, "push");
  fs.writeFileSync(path.join(b, "working.md"), "# Keep checkout unchanged\n");
  await invoke(["access", "--state-dir", path.join(root, "other-state"), "--json"], b);
  fs.unlinkSync(path.join(b, "working.md"));
  const cached = await invoke(args, b);
  assert.equal(asRecord(JSON.parse(cached.stdout)).check, "cached");
  assert.equal(git(b, "rev-parse", "HEAD"), head);
  assert.equal(fs.existsSync(path.join(b, "new.md")), false);
});

test("a surviving fetch remains protected after its access owner is terminated", async (t) => {
  const { root, b, state } = await enabledDevices(t);
  const marker = path.join(root, "fetch-ready");
  const release = path.join(root, "release-fetch");
  const script = path.join(root, "delayed-upload-pack");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(script, `#!/bin/sh\nprintf ready > ${quote(marker)}\nwhile [ ! -f ${quote(release)} ]; do sleep 0.05; done\nexec git-upload-pack "$@"\n`, { mode: 0o755 });
  git(b, "config", "remote.origin.uploadpack", quote(script));
  const owner = spawn(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "access", b, "--state-dir", state, "--json"], { cwd: PACKAGE_ROOT, stdio: "ignore" });
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(marker), true);
    // Verify that the fixture established registered surviving-writer ownership
    // before terminating the access owner.
    let registered = false;
    while (!registered && Date.now() < deadline) {
      const lock = asRecord(JSON.parse(git(b, "cat-file", "blob", "refs/knowledge-loom/mutation-lock")));
      registered = typeof lock.writer_pid === "number" && lock.writer_group === true;
      if (!registered) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(registered, true, "fetch must be registered before terminating its owner");
    owner.kill("SIGKILL");
    await exited;
    const result = await invoke(["access", "--state-dir", state, "--json"], b);
    assert.equal(asRecord(JSON.parse(result.stdout)).status, "busy");
  } finally {
    fs.writeFileSync(release, "release");
    if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGKILL");
    await exited;
    // Wait for the surviving fetch to finish before removing its temporary repository.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});

test("termination before writer registration cannot start unprotected work", async (t) => {
  const { root, b, state } = await enabledDevices(t);
  const bin = path.join(root, "bin"); fs.mkdirSync(bin);
  const marker = path.join(root, "registering");
  const release = path.join(root, "release-registration");
  const counter = path.join(root, "updates");
  const write = path.join(root, "unprotected-write");
  const realGit = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
  assert.ok(realGit);
  fs.writeFileSync(path.join(bin, "git"), `#!/usr/bin/env node
const fs=require('node:fs'); const cp=require('node:child_process');
const args=process.argv.slice(2); const counter=${JSON.stringify(counter)};
if(args.includes('update-ref')&&!args.includes('-d')) {
  const n=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8'))+1:1;
  fs.writeFileSync(counter,String(n));
  if(n===2) {
    fs.writeFileSync(${JSON.stringify(marker)},'ready');
    const timer=setInterval(()=>{ if(fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); process.exit(1); } },10);
  } else { const r=cp.spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}); process.exit(r.status??1); }
} else { const r=cp.spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}); process.exit(r.status??1); }
`, { mode: 0o755 });
  const owner = spawn(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "with-vault-lock", b, "--", process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(write)},'unprotected');`], {
    cwd: PACKAGE_ROOT, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, stdio: "ignore",
  });
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(marker), true);
    owner.kill("SIGKILL");
    await exited;
    const recovered = await invoke(["access", "--state-dir", state, "--json"], b);
    assert.equal(asRecord(JSON.parse(recovered.stdout)).status, "current");
    assert.equal(fs.existsSync(write), false, "the command must not start before registration");
  } finally {
    fs.writeFileSync(release, "release");
    if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGKILL");
    await exited;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

test("failed writer registration terminates and awaits the child before releasing ownership", async (t) => {
  const { root, b } = await enabledDevices(t);
  const bin = path.join(root, "bin"); fs.mkdirSync(bin);
  const counter = path.join(root, "updates");
  const lateWrite = path.join(root, "unprotected-write");
  const realGit = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
  assert.ok(realGit);
  fs.writeFileSync(path.join(bin, "git"), `#!/usr/bin/env node\nconst fs=require('node:fs'); const cp=require('node:child_process'); const args=process.argv.slice(2); const counter=${JSON.stringify(counter)}; if(args.includes('update-ref')&&!args.includes('-d')) { const n=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8'))+1:1; fs.writeFileSync(counter,String(n)); if(n===2) process.exit(1); } const r=cp.spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}); process.exit(r.status??1);\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "with-vault-lock", b, "--", process.execPath, "-e", `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(lateWrite)},'unprotected'),1000);`], {
    cwd: PACKAGE_ROOT, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /track the active writer/);
  assert.equal(fs.existsSync(lateWrite), false);
});

test("a branch switch during fetch defers integration into the newly selected branch", async (t) => {
  const { root, a, b, state } = await enabledDevices(t);
  fs.writeFileSync(path.join(a, "new.md"), "# Remote change\n");
  git(a, "add", "new.md"); git(a, "commit", "-m", "Remote change"); git(a, "push");
  const marker = path.join(root, "fetch-ready");
  const release = path.join(root, "release-fetch");
  const script = path.join(root, "delayed-upload-pack");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(script, `#!/bin/sh\nprintf ready > ${quote(marker)}\nwhile [ ! -f ${quote(release)} ]; do sleep 0.05; done\nexec git-upload-pack "$@"\n`, { mode: 0o755 });
  git(b, "config", "remote.origin.uploadpack", quote(script));
  const pending = invoke(["access", "--state-dir", state, "--json"], b);
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(marker), true);
    git(b, "switch", "-c", "unrelated");
  } finally { fs.writeFileSync(release, "release"); }
  const result = await pending;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(asRecord(JSON.parse(result.stdout)).status, "unavailable");
  assert.equal(fs.existsSync(path.join(b, "new.md")), false);
});

test("a registered writer can finish stdout and stderr after its lock owner exits", async (t) => {
  const { root, b, state } = await enabledDevices(t);
  const ready = path.join(root, "writer-ready");
  const release = path.join(root, "release-output");
  const finished = path.join(root, "writer-finished");
  const script = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(ready)}, 'ready'); const timer=setInterval(()=>{ if(!fs.existsSync(${JSON.stringify(release)})) return; clearInterval(timer); process.stdout.write('out'.repeat(32768), error=>{ if(error) process.exit(1); process.stderr.write('err'.repeat(32768), error=>{ if(error) process.exit(1); fs.writeFileSync(${JSON.stringify(finished)}, 'finished'); }); }); }, 10);`;
  const owner = spawn(process.execPath, ["--import", "tsx", "src/knowledge-loom/runner.ts", "with-vault-lock", b, "--", process.execPath, "-e", script], { cwd: PACKAGE_ROOT, stdio: "ignore" });
  const exited = new Promise<void>((resolve) => owner.once("exit", () => resolve()));
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(ready) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(ready), true);
    owner.kill("SIGKILL"); await exited;
    fs.writeFileSync(release, "release");
    const completionDeadline = Date.now() + 3000;
    while (!fs.existsSync(finished) && Date.now() < completionDeadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fs.existsSync(finished), true, "closed owner pipes must not abort a registered writer");
    const result = await invoke(["access", "--state-dir", state, "--json"], b);
    assert.equal(asRecord(JSON.parse(result.stdout)).status, "current");
  } finally { fs.writeFileSync(release, "release"); owner.kill("SIGKILL"); }
});

test("a connected lock owner receives complete output and the writer's failing exit status", async (t) => {
  const { b } = await enabledDevices(t);
  const result = await invoke(["with-vault-lock", b, "--", process.execPath, "-e", "process.stdout.write('out'.repeat(32768)); process.stderr.write('err'.repeat(32768)); process.exitCode=7;"], b);
  assert.equal(result.code, 7);
  assert.equal(result.stdout, "out".repeat(32768));
  assert.equal(result.stderr, "err".repeat(32768));
});
