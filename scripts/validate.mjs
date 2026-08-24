#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(...arguments_) {
  const completed = spawnSync(process.execPath, arguments_, { cwd: PACKAGE_ROOT, stdio: "inherit" });
  if (completed.status !== 0) throw new Error(`${arguments_.join(" ")} exited with status ${completed.status}`);
}

export function main(arguments_ = process.argv.slice(2)) {
  const includeNpx = arguments_.includes("--npx");
  if (arguments_.some((argument) => argument !== "--npx")) throw new Error(`unknown argument: ${arguments_.find((argument) => argument !== "--npx")}`);
  run("node_modules/typescript/bin/tsc", "--noEmit");
  run("scripts/build-skill-packages.mjs", "--check");
  run("scripts/run-tests.mjs");
  for (const fixture of ["single-proactive", "shared-explicit"]) {
    run("--import", "tsx", "src/knowledge-loom/runner.ts", "audit", `tests/fixtures/${fixture}`);
  }
  run("--import", "tsx", "scripts/run-behavior-evals.mjs");
  run("scripts/build-claude-desktop-skill.mjs");
  if (includeNpx) run("scripts/test-npx-install.mjs");
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
}
