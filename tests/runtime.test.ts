import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PACKAGE_ROOT, temporaryDirectory } from "./helpers.ts";

function cli(home: string, ...args: string[]) {
  const result = spawnSync(process.execPath, ["dist/maintenance.cjs", ...args, "--home", home], { cwd: PACKAGE_ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
test("setup previews external shared-owner routing without changing a home", (t) => {
  const home = fs.realpathSync(temporaryDirectory(t));
  const preview = cli(home, "setup", "--source", PACKAGE_ROOT);
  assert.equal(preview.status, "preview");
  assert.equal(preview.owner, "shared-skills");
  assert.equal(preview.automaticMaintenance, false);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.ok(preview.changes.some((change: { path: string }) => change.path.endsWith(".codex/AGENTS.md")));
  assert.ok(preview.changes.some((change: { path: string }) => change.path.endsWith(".claude/CLAUDE.md")));
});
test("setup applies twice, preserves unrelated instructions/settings and verifies the external route", (t) => {
  const home = fs.realpathSync(temporaryDirectory(t));
  fs.mkdirSync(path.join(home, ".claude"));
  fs.writeFileSync(path.join(home, ".claude/CLAUDE.md"), "Keep my guidance.\n");
  fs.writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ model: "keep", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo keep" }] }] } }));
  const first = cli(home, "setup", "--source", PACKAGE_ROOT, "--apply");
  assert.equal(first.status, "configured");
  assert.equal(first.automaticMaintenance, false); // Runtime execution must be observed separately.
  const before = fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8");
  const second = cli(home, "setup", "--source", PACKAGE_ROOT, "--apply");
  assert.equal(second.status, "configured");
  assert.equal(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"), before);
  assert.match(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), /^Keep my guidance\.\n/);
  assert.equal(JSON.parse(before).model, "keep");
  assert.equal(cli(home, "route", "--mode", "project").vault.status, "not-applicable");
  assert.equal(fs.realpathSync(path.join(home, ".claude/skills/use-knowledge-vault")), fs.realpathSync(path.join(home, ".agents/skills/use-knowledge-vault")));
});
test("duplicate migration is explicit, preserves plugin caches and ordinary backups, and refuses local edits", (t) => {
  const home = fs.realpathSync(temporaryDirectory(t));
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(home, ".agents/skills"), { recursive: true });
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(home, ".claude/skills"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ enabledPlugins: { "knowledge-loom@knowledge-loom": true, "other@other": true } }));
  const preview = cli(home, "setup", "--source", PACKAGE_ROOT);
  assert.equal(preview.duplicates.length, 4);
  assert.deepEqual(preview.plugins.claude, ["knowledge-loom@knowledge-loom"]);
  const refused = spawnSync(process.execPath, ["dist/maintenance.cjs", "setup", "--home", home, "--source", PACKAGE_ROOT, "--apply"], { encoding: "utf8" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /--migrate/);
  const changed = path.join(home, ".claude/skills/use-knowledge-vault/SKILL.md");
  fs.appendFileSync(changed, "\nLocal customization\n");
  const collision = spawnSync(process.execPath, ["dist/maintenance.cjs", "setup", "--home", home, "--source", PACKAGE_ROOT, "--apply", "--migrate"], { encoding: "utf8" });
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /local modification/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8")).enabledPlugins["knowledge-loom@knowledge-loom"], true);
  fs.copyFileSync(path.join(PACKAGE_ROOT, "skills/use-knowledge-vault/SKILL.md"), changed);
  cli(home, "setup", "--source", PACKAGE_ROOT, "--apply", "--migrate");
  const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["knowledge-loom@knowledge-loom"], false);
  assert.equal(settings.enabledPlugins["other@other"], true);
  assert.ok(fs.existsSync(path.join(home, ".local/share/knowledge-loom/runtime-backups/.claude/skills/use-knowledge-vault/SKILL.md")));
});
test("external access works with an old skill and shares release/daily checks across continuing runtime calls", async (t) => {
  const { runRuntime } = await import("../src/maintenance/runtime.ts");
  const { copyFixture } = await import("./helpers.ts");
  const home = fs.realpathSync(temporaryDirectory(t));
  const source = path.join(home, "old-source");
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(source, "skills"), { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), '{"version":"0.7.0"}');
  for (const name of ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"]) fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\nOld instructions without maintenance.\n`);
  cli(home, "setup", "--source", source, "--apply");
  const vault = copyFixture("single-proactive", path.join(home, "vault"));
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", ["-C", cwd, "-c", "user.name=Example", "-c", "user.email=example@example.com", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const contract = path.join(vault, "KNOWLEDGE_VAULT.md");
  fs.writeFileSync(contract, fs.readFileSync(contract, "utf8").replace("type: none", "type: git").replace("sync:\n  mode: none", "sync:\n  mode: git-remote-push\n  inbound:\n    mode: fast-forward\n    remote: origin\n    branch: main"));
  const remote = path.join(home, "remote.git");
  git(home, "init", "--bare", "--initial-branch=main", remote);
  git(vault, "init", "--initial-branch=main"); git(vault, "config", "user.name", "Example"); git(vault, "config", "user.email", "example@example.com"); git(vault, "add", "."); git(vault, "commit", "-m", "Initial"); git(vault, "remote", "add", "origin", remote); git(vault, "push", "-u", "origin", "main");
  const other = path.join(home, "other"); git(home, "clone", remote, other);
  let now = 1_800_000_000_000, lookups = 0;
  const ports = { cwd: vault, now: () => now, releases: { async list() { lookups++; return [{ version: "0.7.0", published: true, prerelease: false, revision: "a".repeat(40) }]; }, async stage(_release: unknown, target: string) { fs.cpSync(source, target, { recursive: true }); } } };
  const access = (runtime: string, extra: string[] = []) => runRuntime("route", ["--home", home, "--runtime", runtime, ...extra], ports) as Promise<any>;
  const first = await access("codex", ["--loaded-version", "0.6.0"]);
  assert.equal(first.release.installedVersion, "0.7.0"); assert.equal(first.release.loadedVersion, "0.6.0"); assert.equal(first.vault.status, "current");
  const cached = await access("claude"); assert.equal(cached.vault.check, "cached"); assert.equal(cached.release.status, "not-due"); assert.equal(lookups, 1);
  fs.writeFileSync(path.join(other, "remote.md"), "# Remote addition\n"); git(other, "add", "."); git(other, "commit", "-m", "Remote addition"); git(other, "push");
  now += 86_400_000;
  assert.equal((await access("codex")).vault.status, "integrated");
  assert.equal(fs.readFileSync(path.join(vault, "remote.md"), "utf8"), "# Remote addition\n");
  fs.writeFileSync(path.join(other, "deferred.md"), "# Deferred remote addition\n"); git(other, "add", "deferred.md"); git(other, "commit", "-m", "Deferred addition"); git(other, "push");
  fs.appendFileSync(path.join(vault, "INDEX.md"), "\nUnfinished local work\n");
  now += 86_400_000;
  const deferred = await access("claude");
  assert.equal(deferred.vault.status, "behind");
  assert.match(fs.readFileSync(path.join(vault, "INDEX.md"), "utf8"), /Unfinished local work/);
  git(vault, "restore", "INDEX.md"); // Test-owned hunk only.
  now += 5 * 86_400_000;
  await access("claude"); assert.equal(lookups, 2);
  const project = path.join(home, "project"); fs.mkdirSync(project);
  const { runCli } = await import("../src/knowledge-loom/cli.ts");
  const registry = path.join(home, ".config/knowledge-vault/registry.yaml");
  const quiet = { write(_value: string) {} };
  assert.equal(await runCli(["register", "acme-work", vault, "--registry", registry, "--apply"], { stdout: quiet }), 0);
  assert.equal(await runCli(["associate", "acme-work", project, "--registry", registry, "--apply"], { stdout: quiet }), 0);
  const associated = await runRuntime("route", ["--home", home], { ...ports, cwd: project }) as any;
  assert.equal(associated.vault.root, fs.realpathSync(vault));
  // Transport failure preserves local work and durable pending publication.
  fs.renameSync(remote, remote + ".offline"); now += 86_400_000;
  assert.equal((await access("codex")).vault.status, "unavailable");
  fs.writeFileSync(path.join(vault, "local.md"), "# Local addition\n"); git(vault, "add", "local.md"); git(vault, "commit", "-m", "Local addition");
  assert.equal((await access("claude", ["--operation", "sync"])).vault.status, "pending");
  fs.renameSync(remote + ".offline", remote); now += 300_000;
  assert.equal((await access("codex", ["--operation", "sync"])).vault.status, "synchronized");
  // A rejected push bypasses today's cached access and returns evidence to this runtime.
  fs.writeFileSync(path.join(other, "race.md"), "# Concurrent contribution\n"); git(other, "add", "race.md"); git(other, "commit", "-m", "Concurrent contribution"); git(other, "pull", "--rebase"); git(other, "push");
  fs.writeFileSync(path.join(vault, "next.md"), "# Next local contribution\n"); git(vault, "add", "next.md"); git(vault, "commit", "-m", "Next contribution");
  const pending = await access("claude", ["--operation", "sync"]);
  assert.equal(pending.vault.status, "needs-reconciliation");
  const resolution = path.join(home, "resolution.json");
  fs.writeFileSync(resolution, JSON.stringify({ ours: pending.vault.evidence.ours, theirs: pending.vault.evidence.theirs, rationale: "Independent synthetic contributions are additive according to the common ancestor and both file contents.", files: [] }));
  assert.equal((await access("claude", ["--operation", "sync", "--resolution", resolution])).vault.status, "synchronized");
  assert.equal(fs.readFileSync(path.join(vault, "race.md"), "utf8"), "# Concurrent contribution\n");
  assert.equal(git(vault, "rev-parse", "HEAD"), git(remote, "rev-parse", "main"));
});
test("ordinary conversation, startup and no associated vault cause no maintenance calls", async (t) => {
  const { runRuntime } = await import("../src/maintenance/runtime.ts");
  const home = fs.realpathSync(temporaryDirectory(t));
  let lookups = 0;
  const result = await runRuntime("route", ["--home", home], { cwd: home, releases: { async list() { lookups++; throw new Error("unexpected network"); }, async stage() { throw new Error("unexpected staging"); } } }) as any;
  assert.equal(result.release.status, "not-applicable"); assert.equal(lookups, 0);
  for (const runtime of ["codex", "claude"]) for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse"]) {
    const hook = spawnSync(process.execPath, ["dist/maintenance.cjs", "hook", "--home", home, "--runtime", runtime], { input: JSON.stringify({ hook_event_name: event, prompt: "hello" }), encoding: "utf8" });
    assert.equal(hook.status, 0, hook.stderr);
    if (event === "SessionStart") assert.match(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, /Repeat on actual access later/);
    else assert.deepEqual(JSON.parse(hook.stdout), {});
  }
  assert.deepEqual(fs.readdirSync(home), []);
});
test("setup refuses a runtime directory symlink escaping the selected home before any external write", (t) => {
  const temporary = temporaryDirectory(t);
  const home = path.join(temporary, "home"), external = path.join(temporary, "external");
  fs.mkdirSync(home); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "CLAUDE.md"), "External user guidance\n");
  fs.symlinkSync(external, path.join(home, ".claude"));
  const result = spawnSync(process.execPath, ["dist/maintenance.cjs", "setup", "--home", home, "--source", PACKAGE_ROOT, "--apply"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside.*home|escapes.*home/);
  assert.deepEqual(fs.readdirSync(external), ["CLAUDE.md"]);
  assert.equal(fs.readFileSync(path.join(external, "CLAUDE.md"), "utf8"), "External user guidance\n");
});
test("migration of an existing runtime-specific bootstrap keeps shared skills tracked by the updater", async (t) => {
  const home = fs.realpathSync(temporaryDirectory(t));
  const legacy = path.join(home, ".codex/skills");
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), legacy, { recursive: true });
  cli(home, "bootstrap", "--source", PACKAGE_ROOT, "--target", legacy);
  cli(home, "setup", "--source", PACKAGE_ROOT, "--apply", "--migrate");
  const status = cli(home, "status");
  const shared = path.join(home, ".agents/skills/use-knowledge-vault");
  assert.ok(status.installations.some((installation: { target: string }) => installation.target === shared));
  assert.ok(fs.lstatSync(shared).isSymbolicLink());
  assert.equal(fs.realpathSync(shared), fs.realpathSync(path.join(legacy, "use-knowledge-vault")));
  for (const installation of status.installations) assert.equal(fs.readlinkSync(installation.target), path.join(home, ".local/share/knowledge-loom/current/skills", path.basename(installation.target)));
  const { runRuntime } = await import("../src/maintenance/runtime.ts");
  const updated = await runRuntime("route", ["--home", home, "--mode", "skill"], { cwd: home, releases: { async list() { return [{ version: "0.9.0", published: true, prerelease: false, revision: "b".repeat(40) }]; }, async stage(_release: unknown, target: string) {
    fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(target, "skills"), { recursive: true }); fs.writeFileSync(path.join(target, "package.json"), '{"version":"0.9.0"}');
  } } }) as any;
  assert.equal(updated.release.status, "updated"); assert.equal(updated.release.installedVersion, "0.9.0");
  assert.equal(fs.realpathSync(shared), fs.realpathSync(path.join(legacy, "use-knowledge-vault")));
});
test("verified advisories return to the active runtime before vault operations and bind its assessment", async (t) => {
  const { runRuntime } = await import("../src/maintenance/runtime.ts");
  const { copyFixture } = await import("./helpers.ts");
  const home = fs.realpathSync(temporaryDirectory(t));
  cli(home, "setup", "--source", PACKAGE_ROOT, "--apply");
  const vault = copyFixture("single-proactive", path.join(home, "vault"));
  const ports = { cwd: vault, releases: { async list() { return [{ version: "0.8.0", published: true, prerelease: false, revision: "a".repeat(40) }]; }, async stage(_release: unknown, target: string) {
    fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(target, "skills"), { recursive: true });
    fs.writeFileSync(path.join(target, "package.json"), '{"version":"0.8.0"}');
    fs.writeFileSync(path.join(target, "data-integrity-advisories.json"), JSON.stringify([{ id: "example", affectedVersions: ["0.8.0"], message: "Synthetic advisory requiring operation assessment.", url: "https://github.com/magickaichen/knowledge-loom/issues/47" }]));
  } } };
  const paused = await runRuntime("route", ["--home", home], ports) as any;
  assert.equal(paused.vault.status, "advisory-assessment-required");
  assert.equal(paused.release.advisories[0].id, "example");
  const decision = path.join(home, "assessment.json");
  fs.writeFileSync(decision, JSON.stringify({ ...paused.assessmentRequest, proceed: true, rationale: "This synthetic contract has no inbound integration; the advisory is inapplicable to this operation." }));
  const allowed = await runRuntime("route", ["--home", home, "--advisory-assessment", decision], ports) as any;
  assert.equal(allowed.vault.status, "not-enabled");
  await assert.rejects(runRuntime("route", ["--home", home, "--operation", "sync", "--advisory-assessment", decision], ports), /assessment/);
});
test("setup reports a busy maintenance owner without writing pending runtime configuration", async (t) => {
  const { runRuntime } = await import("../src/maintenance/runtime.ts");
  const home = fs.realpathSync(temporaryDirectory(t));
  cli(home, "setup", "--source", PACKAGE_ROOT, "--apply");
  const instruction = path.join(home, ".claude/CLAUDE.md"); fs.unlinkSync(instruction);
  let release!: () => void, started!: () => void;
  const inFlight = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const work = runRuntime("route", ["--home", home, "--mode", "skill"], { cwd: home, releases: { async list() { started(); await held; return []; }, async stage() {} } });
  await inFlight;
  try {
    const result = spawnSync(process.execPath, ["dist/maintenance.cjs", "setup", "--home", home, "--source", PACKAGE_ROOT, "--apply"], { encoding: "utf8", timeout: 20_000 });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /busy/);
    assert.equal(fs.existsSync(instruction), false);
  } finally { release(); await work; }
});
