import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { errorMessage } from "../src/knowledge-loom/errors.ts";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(...arguments_: string[]): void {
  const completed = spawnSync(process.execPath, arguments_, { cwd: PACKAGE_ROOT, stdio: "inherit" });
  if (completed.status !== 0) throw new Error(`${arguments_.join(" ")} exited with status ${completed.status}`);
}

export function main(arguments_: string[] = process.argv.slice(2)): number {
  const includeNpx = arguments_.includes("--npx");
  if (arguments_.some((argument) => argument !== "--npx")) throw new Error(`unknown argument: ${arguments_.find((argument) => argument !== "--npx")}`);
  run("node_modules/typescript/bin/tsc", "--noEmit");
  run("--import", "tsx", "scripts/build-skill-packages.ts", "--check");
  run("--import", "tsx", "scripts/run-tests.ts");
  for (const fixture of ["single-proactive", "shared-explicit"]) {
    run("--import", "tsx", "src/knowledge-loom/runner.ts", "audit", `tests/fixtures/${fixture}`);
  }
  run("--import", "tsx", "scripts/run-behavior-evals.ts");
  run("--import", "tsx", "scripts/build-claude-desktop-skill.ts");
  if (includeNpx) run("--import", "tsx", "scripts/test-npx-install.ts");
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${errorMessage(error)}`); process.exitCode = 1; }
}
