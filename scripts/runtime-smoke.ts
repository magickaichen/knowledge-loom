/** Opt-in installed-runtime smoke; every writable artifact is under a synthetic temporary home. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-loom-runtime-smoke-"));
const project = path.join(home, "synthetic-vault");
fs.cpSync(path.join(repository, "tests/fixtures/single-proactive"), project, { recursive: true });
const setup = spawnSync(process.execPath, [path.join(repository, "dist/maintenance.cjs"), "setup", "--source", repository, "--home", home, "--apply"], { encoding: "utf8", timeout: 60_000 });
if (setup.status !== 0) throw new Error(setup.stderr);
const env = { ...process.env, HOME: home, CODEX_HOME: path.join(home, ".codex"), CLAUDE_CONFIG_DIR: path.join(home, ".claude") };
// Do not copy auth/config from the real home. Hosted tool use may remain untested without login.
const results = [];
for (const runtime of ["codex", "claude"]) {
  const prompt = "This is an isolated runtime smoke test. Use Knowledge Loom to inspect this synthetic vault through the configured external route. Report separate release and vault state.";
  const args = runtime === "codex" ? ["exec", "--skip-git-repo-check", "--json", "-C", project, prompt] : ["-p", "--output-format", "json", "--no-session-persistence", prompt];
  const result = spawnSync(runtime, args, { env, cwd: project, encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(home, `${runtime}.log`), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  results.push({ runtime, exitCode: result.status, error: result.error?.message ?? null, log: path.join(home, `${runtime}.log`) });
}
console.log(JSON.stringify({ home, results, interpretation: "Inspect logs and actual tool calls; startup alone does not establish access or automatic maintenance. Hosted login is deliberately not inherited from real configuration." }, null, 2));
