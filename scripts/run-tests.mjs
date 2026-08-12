#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testFiles = fs.readdirSync(path.join(packageRoot, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => path.join("tests", name));
const completed = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: packageRoot,
  stdio: "inherit",
});
process.exitCode = completed.status ?? 1;
