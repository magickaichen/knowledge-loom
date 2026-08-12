#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalPath, expandHome } from "../src/knowledge-loom/pathing.mjs";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SKILLS = ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"];
export const DEFAULT_TARGETS = [path.join(os.homedir(), ".agents", "skills"), path.join(os.homedir(), ".claude", "skills")];

export function install(packageRoot, targetRoots, { apply = false, log = console.log } = {}) {
  const resolvedPackageRoot = canonicalPath(packageRoot);
  const targets = targetRoots.map((target) => canonicalPath(expandHome(String(target))));
  const unchanged = [];
  const actions = [];
  for (const targetRoot of targets) {
    for (const name of SKILLS) {
      const source = path.join(resolvedPackageRoot, "skills", name);
      const target = path.join(targetRoot, name);
      if (!fs.statSync(path.join(source, "SKILL.md"), { throwIfNoEntry: false })?.isFile()) throw new Error(`missing skill source: ${source}`);
      const existing = fs.lstatSync(target, { throwIfNoEntry: false });
      if (existing?.isSymbolicLink() && fs.realpathSync(target) === source) {
        unchanged.push([source, target]);
        continue;
      }
      if (existing) throw new Error(`refusing to replace existing install: ${target}`);
      actions.push([source, target]);
    }
  }
  for (const [source, target] of unchanged) log(`OK      ${target} -> ${source}`);
  for (const [source, target] of actions) {
    if (apply) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
      log(`LINKED  ${target} -> ${source}`);
    } else {
      log(`DRY RUN link ${target} -> ${source}`);
    }
  }
  return 0;
}

export function main(arguments_ = process.argv.slice(2)) {
  const targets = [];
  let apply = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--target" && arguments_[index + 1]) targets.push(arguments_[++index]);
    else throw new Error(`unknown or incomplete argument: ${argument}`);
  }
  return install(PACKAGE_ROOT, targets.length ? targets : DEFAULT_TARGETS, { apply });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
}
