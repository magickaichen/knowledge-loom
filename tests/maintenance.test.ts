import { zipSync, type Zippable } from "fflate";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { maintain } from "../src/maintenance/maintenance.ts";
import { PACKAGE_ROOT, temporaryDirectory, copyReleaseFixture } from "./helpers.ts";

const bootstrapRunner = path.join(PACKAGE_ROOT, "dist", "maintenance.cjs");

function installationFiles(t: TestContext): { home: string; target: string; source: string } {
  const home = temporaryDirectory(t);
  const target = path.join(home, ".agents", "skills");
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), target, { recursive: true });
  const source = copyReleaseFixture(path.join(home, "source"), "0.8.0");
  return { home, target, source };
}
async function bootstrapInstallation(t: TestContext): Promise<{ home: string; target: string }> {
  const installation = installationFiles(t);
  await maintain({ command: "bootstrap", bootstrapRunner, ...installation, targets: [installation.target] });
  return installation;
}
async function stageRelease(release: { version: string }, destination: string): Promise<void> {
  copyReleaseFixture(destination, release.version);
}

test("explicit bootstrap keeps old skills usable through an external entry point", async (t) => {
  const { home, target, source } = installationFiles(t);
  const result = await maintain({ command: "bootstrap", bootstrapRunner, home, source, targets: [target] });
  assert.equal(result.status, "bootstrapped");
  assert.equal(result.installedVersion, "0.8.0");
  assert.equal(result.loadedVersion, "unknown");
  assert.ok(result.entryPoint && fs.existsSync(result.entryPoint));
  assert.ok(!result.entryPoint.startsWith(target));
  assert.ok(fs.readFileSync(path.join(target, "use-knowledge-vault", "SKILL.md"), "utf8").includes("Use Knowledge Vault"));
  assert.equal((await maintain({ command: "status", home })).status, "ready");
});

test("due use selects only published stable revisions at the elapsed weekly boundary", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  let lookups = 0;
  let now = Date.UTC(2026, 0, 1);
  const releases = {
    async list() { lookups++; return [
      { version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false },
      { version: "1.0.0", revision: "b".repeat(40), published: true, prerelease: true },
      { version: "2.0.0", revision: "c".repeat(40), published: false, prerelease: false },
    ]; },
    stage: stageRelease,
  };
  const ports = { releases, now: () => now };
  const first = await maintain({ command: "use", home, loadedVersion: "0.8.0" }, ports);
  assert.equal(first.installedVersion, "0.9.0");
  assert.equal(first.loadedVersion, "0.8.0");
  assert.equal(first.installedRevision, "a".repeat(40));
  now += 604_800_000 - 1;
  assert.equal((await maintain({ command: "use", home }, ports)).status, "not-due");
  assert.equal(lookups, 1);
  now++;
  assert.equal((await maintain({ command: "use", home }, ports)).status, "current");
  assert.equal(lookups, 2);
});

test("two runtime callers share one due lookup and installation", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  let lookups = 0;
  const ports = { releases: {
    async list() { lookups++; await new Promise((resolve) => setTimeout(resolve, 50)); return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    stage: stageRelease,
  } };
  const results = await Promise.all([maintain({ command: "use", home }, ports), maintain({ command: "use", home }, ports)]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["not-due", "updated"]);
  assert.equal(lookups, 1);
});

test("failed lookups retain last observation and back off durably", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  let now = Date.UTC(2026, 0, 1);
  let lookups = 0;
  const ports = { now: () => now, releases: {
    async list() { lookups++; throw new Error("offline"); },
    async stage() { throw new Error("must not install"); },
  } };
  const failed = await maintain({ command: "use", home }, ports);
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastCheck, undefined);
  assert.match(failed.recovery?.error ?? "", /offline/);
  assert.equal((await maintain({ command: "use", home }, ports)).status, "backoff");
  assert.equal(lookups, 1);
  now += 60_000;
  assert.equal((await maintain({ command: "use", home }, ports)).status, "failed");
  assert.equal(lookups, 2);
  assert.equal((await maintain({ command: "status", home })).installedVersion, "0.8.0");
});

test("local edits block the whole update while manager bookkeeping and other skills survive", async (t) => {
  const { home, target, source } = installationFiles(t);
  const bookkeeping = path.join(home, ".agents", ".skill-lock.json");
  fs.writeFileSync(bookkeeping, '{"version":3,"skills":{"unrelated":{"hash":"keep"}}}');
  fs.mkdirSync(path.join(target, "unrelated"));
  fs.writeFileSync(path.join(target, "unrelated", "SKILL.md"), "keep");
  await maintain({ command: "bootstrap", bootstrapRunner, home, source, targets: [target] });
  const edited = path.join(target, "use-knowledge-vault", "SKILL.md");
  fs.appendFileSync(edited, "\nLocal instruction\n");
  const ports = { releases: {
    async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    stage: stageRelease,
  } };
  const result = await maintain({ command: "use", home }, ports);
  assert.equal(result.status, "failed");
  assert.match(result.recovery?.error ?? "", /local modification/);
  assert.equal(result.installedVersion, "0.8.0");
  assert.match(fs.readFileSync(edited, "utf8"), /Local instruction/);
  assert.equal(fs.readFileSync(bookkeeping, "utf8"), '{"version":3,"skills":{"unrelated":{"hash":"keep"}}}');
  assert.equal(fs.readFileSync(path.join(target, "unrelated", "SKILL.md"), "utf8"), "keep");
});

test("interruption after the atomic switch recovers the complete new bundle", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const rename = fs.renameSync;
  const fault = t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    rename(from, to);
    if (String(to) === path.join(fs.realpathSync(home), ".local", "share", "knowledge-loom", "current")) throw new Error("simulated interruption after switch");
  });
  const interrupted = await maintain({ command: "use", home }, { releases: {
    async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    stage: stageRelease,
  } });
  fault.mock.restore();
  assert.equal(interrupted.installedVersion, "0.9.0");
  const recovered = await maintain({ command: "status", home });
  assert.equal(recovered.installedVersion, "0.9.0");
  assert.equal(recovered.installedRevision, "a".repeat(40));
  assert.equal(recovered.status, "recovered");
  assert.equal((await maintain({ command: "status", home })).status, "ready");
});

test("bootstrap resumes an interrupted adoption without losing originals", async (t) => {
  const { home, target, source } = installationFiles(t);
  const symlink = fs.symlinkSync;
  const fault = t.mock.method(fs, "symlinkSync", (...args: Parameters<typeof fs.symlinkSync>) => {
    if (String(args[1]).endsWith("/use-knowledge-vault")) throw new Error("interrupted adoption");
    return symlink(...args);
  });
  await assert.rejects(maintain({ command: "bootstrap", bootstrapRunner, home, source, targets: [target] }), /interrupted adoption/);
  for (const name of ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"]) {
    assert.equal(fs.readFileSync(path.join(target, name, "SKILL.md"), "utf8"), fs.readFileSync(path.join(PACKAGE_ROOT, "skills", name, "SKILL.md"), "utf8"));
  }
  fault.mock.restore();
  const result = await maintain({ command: "status", home });
  assert.equal(result.status, "recovered");
  assert.equal(fs.readFileSync(path.join(target, "use-knowledge-vault", "SKILL.md"), "utf8"), fs.readFileSync(path.join(PACKAGE_ROOT, "skills", "use-knowledge-vault", "SKILL.md"), "utf8"));
});

test("explicit pins persist across callers and reject unpublished versions", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const ports = { releases: {
    async list() { return ["0.8.0", "0.9.0"].map((version) => ({ version, revision: "a".repeat(40), published: true, prerelease: false })); },
    stage: stageRelease,
  } };
  assert.equal((await maintain({ command: "use", home, pin: "0.8.0" }, ports)).installedVersion, "0.8.0");
  assert.equal((await maintain({ command: "use", home }, ports)).installedVersion, "0.8.0");
  assert.equal((await maintain({ command: "use", home, pin: "none" }, ports)).installedVersion, "0.9.0");
  const lastCheck = (await maintain({ command: "status", home })).lastCheck;
  const unavailable = await maintain({ command: "use", home, pin: "0.7.0" }, ports);
  assert.equal(unavailable.status, "failed");
  assert.equal(unavailable.lastCheck, lastCheck);
});

test("old skill releases need no embedded update logic to bootstrap", async (t) => {
  const home = temporaryDirectory(t);
  const old = path.join(home, "old-release");
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), path.join(old, "skills"), { recursive: true });
  fs.writeFileSync(path.join(old, "package.json"), '{"version":"0.1.0"}');
  const target = path.join(home, ".claude", "skills");
  fs.cpSync(path.join(old, "skills"), target, { recursive: true });
  const result = await maintain({ command: "bootstrap", bootstrapRunner, home, source: old, targets: [target] });
  assert.equal(result.installedVersion, "0.1.0");
  assert.equal(result.status, "bootstrapped");
});

test("verified release advisories apply to known loaded versions without requesting restart", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const ports = { releases: {
    async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    async stage(release: { version: string }, destination: string) {
      await stageRelease(release, destination);
      fs.writeFileSync(path.join(destination, "data-integrity-advisories.json"), JSON.stringify([
        { id: "fixture-advisory", affectedVersions: ["0.8.0"], message: "Verify the saved fixture before further writes.", url: "https://github.com/magickaichen/knowledge-loom/issues/46" },
      ]));
    },
  } };
  const result = await maintain({ command: "use", home, loadedVersion: "0.8.0" }, ports);
  assert.equal(result.advisories?.[0]?.id, "fixture-advisory");
  assert.equal(result.restartRequired, false);
  assert.deepEqual((await maintain({ command: "status", home })).advisories, []);
});

test("bootstrap detects linked installations and refuses plugin-owned caches", async (t) => {
  const home = temporaryDirectory(t);
  const target = path.join(home, ".agents", "skills");
  fs.mkdirSync(target, { recursive: true });
  for (const name of ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"]) fs.symlinkSync(path.join(PACKAGE_ROOT, "skills", name), path.join(target, name));
  const result = await maintain({ command: "bootstrap", bootstrapRunner, home, source: PACKAGE_ROOT, targets: [target] });
  assert.ok(result.installations?.every((installation) => installation.route === "symlink"));
  const pluginHome = temporaryDirectory(t);
  const plugin = path.join(pluginHome, ".codex", "plugins", "cache", "knowledge-loom", "skills");
  fs.cpSync(path.join(PACKAGE_ROOT, "skills"), plugin, { recursive: true });
  await assert.rejects(maintain({ command: "bootstrap", bootstrapRunner, home: pluginHome, source: PACKAGE_ROOT, targets: [plugin] }), /plugin.*owner/);
});

test("skills CLI ownership is detected and bookkeeping remains byte-identical after update", async (t) => {
  const { home, target, source } = installationFiles(t);
  const lockFile = path.join(home, "skills-lock.json");
  const contents = '{"version":1,"skills":{"use-knowledge-vault":{"source":"magickaichen/knowledge-loom","sourceType":"github","computedHash":"old"},"other":{"computedHash":"keep"}}}';
  fs.writeFileSync(lockFile, contents);
  const bootstrap = await maintain({ command: "bootstrap", bootstrapRunner, home, source, targets: [target] });
  assert.equal(bootstrap.installations?.find((item) => item.target.endsWith("use-knowledge-vault"))?.route, "skills-cli");
  const updated = await maintain({ command: "use", home }, { releases: {
    async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    stage: stageRelease,
  } });
  assert.equal(updated.status, "updated");
  assert.equal(fs.readFileSync(lockFile, "utf8"), contents);
});

test("a killed staging process leaves the previous bundle and a recoverable shared lock", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const child = spawn(process.execPath, ["--import", "tsx", "tests/support/interrupted-maintenance.ts", home], { cwd: PACKAGE_ROOT });
  t.after(() => child.kill("SIGKILL"));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("staging timeout")); }, 10_000);
    child.once("error", reject);
    child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  const busy = await maintain({ command: "use", home, lockWaitMs: 25 });
  assert.equal(busy.status, "busy");
  child.kill("SIGKILL");
  await closed;
  const recovered = await maintain({ command: "status", home });
  assert.equal(recovered.installedVersion, "0.8.0");
  assert.match(recovered.recovery?.error ?? "", /interrupted/);
  assert.equal(recovered.status, "recovered");
});

test("the bootstrapped CLI runs independently of the source checkout", async (t) => {
  const { home, target, source } = installationFiles(t);
  const bootstrap = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, "dist", "maintenance.cjs"), "bootstrap", "--home", home, "--source", source, "--target", target], { encoding: "utf8", cwd: home });
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  const entry = path.join(home, ".local", "share", "knowledge-loom", "maintenance.cjs");
  const status = spawnSync(process.execPath, [entry, "status", "--home", home, "--loaded-version", "0.7.0"], { encoding: "utf8", cwd: home, env: { ...process.env, HOME: home, NODE_PATH: "" } });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).loadedVersion, "0.7.0");
  assert.equal(JSON.parse(status.stdout).installedVersion, "0.8.0");
});

test("an incomplete staged release cannot replace the usable bundle", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const failed = await maintain({ command: "use", home }, { releases: {
    async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
    async stage(release: { version: string }, destination: string) {
      await stageRelease(release, destination);
      fs.rmSync(path.join(destination, "skills", "init-knowledge-vault", "references", "contract-schema.md"));
    },
  } });
  assert.equal(failed.status, "failed");
  assert.equal(failed.installedVersion, "0.8.0");
});

test("public use downloads a published GitHub release by its resolved immutable revision", async (t) => {
  const { home, target } = await bootstrapInstallation(t);
  const revision = "d".repeat(40);
  const prefix = `knowledge-loom-${revision}/`;
  const files: Zippable = { [`${prefix}package.json`]: Buffer.from('{"version":"0.9.0"}') };
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[prefix + path.relative(PACKAGE_ROOT, file)] = fs.readFileSync(file);
    }
  };
  visit(path.join(PACKAGE_ROOT, "skills"));
  const archive = zipSync(files);
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("releases?per_page=100&page=1")) return Response.json([
      { tag_name: "v0.9.0", draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" },
      { tag_name: "v1.0.0", draft: false, prerelease: true, published_at: "2026-01-02T00:00:00Z" },
      { tag_name: "v2.0.0", draft: true, prerelease: false, published_at: null },
    ]);
    if (url.endsWith("git/ref/tags/v0.9.0")) return Response.json({ object: { type: "tag", sha: "e".repeat(40) } });
    if (url.endsWith(`git/tags/${"e".repeat(40)}`)) return Response.json({ object: { type: "commit", sha: revision } });
    if (url === `https://codeload.github.com/magickaichen/knowledge-loom/zip/${revision}`) return new Response(new Uint8Array(archive));
    throw new Error(`unexpected URL: ${url}`);
  });
  const result = await maintain({ command: "use", home });
  assert.equal(result.status, "updated", result.recovery?.error ?? "release should install");
  assert.equal(result.installedRevision, revision);
  assert.equal(requested.length, 4);
});

test("a pinned current release still supplies verified advisories on due use", async (t) => {
  const { home } = await bootstrapInstallation(t);
  const result = await maintain({ command: "use", home, pin: "0.8.0" }, { releases: {
    async list() { return [{ version: "0.8.0", revision: "f".repeat(40), published: true, prerelease: false }]; },
    async stage(release, destination) {
      await stageRelease(release, destination);
      fs.writeFileSync(path.join(destination, "data-integrity-advisories.json"), JSON.stringify([
        { id: "current-version-advisory", affectedVersions: ["0.8.0"], message: "Inspect fixture integrity.", url: "https://github.com/magickaichen/knowledge-loom/issues/46" },
      ]));
    },
  } });
  assert.equal(result.status, "current");
  assert.equal(result.advisories?.[0]?.id, "current-version-advisory");
  assert.equal((await maintain({ command: "status", home })).advisories?.[0]?.id, "current-version-advisory");
});

test("interruption after one adoption exchange retains all four original skills", async (t) => {
  const { home, target, source } = installationFiles(t);
  const symlink = fs.symlinkSync;
  const fault = t.mock.method(fs, "symlinkSync", (...args: Parameters<typeof fs.symlinkSync>) => {
    if (String(args[1]).endsWith("/init-knowledge-vault")) throw new Error("interrupted after first exchange");
    return symlink(...args);
  });
  await assert.rejects(maintain({ command: "bootstrap", bootstrapRunner, home, source, targets: [target] }), /interrupted after/);
  assert.ok(fs.lstatSync(path.join(target, "use-knowledge-vault")).isSymbolicLink());
  for (const name of ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"]) {
    assert.equal(fs.readFileSync(path.join(target, name, "SKILL.md"), "utf8"), fs.readFileSync(path.join(PACKAGE_ROOT, "skills", name, "SKILL.md"), "utf8"));
  }
  fault.mock.restore();
  assert.equal((await maintain({ command: "status", home })).status, "recovered");
});
