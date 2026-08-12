#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SKILL_REFERENCES = {
  "use-knowledge-vault": ["protocol.md"],
  "init-knowledge-vault": ["protocol.md", "contract-schema.md"],
  "audit-knowledge-vault": ["protocol.md", "contract-schema.md"],
  "manage-current-focus": ["protocol.md"],
};

async function bundledRunner(packageRoot) {
  const result = await build({
    absWorkingDir: packageRoot,
    entryPoints: ["src/knowledge-loom/runner.mjs"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
    legalComments: "none",
    charset: "utf8",
    banner: {
      js: [
        "import { createRequire as __knowledgeLoomCreateRequire } from 'node:module';",
        "const require = __knowledgeLoomCreateRequire(import.meta.url);",
        "// Self-contained Knowledge Loom runner. Bundles yaml 2.9.0 (ISC); see ../licenses/yaml.txt.",
      ].join("\n"),
    },
  });
  return result.outputFiles[0].contents;
}

export async function expectedFiles(packageRoot, skillName) {
  const expected = new Map();
  for (const name of SKILL_REFERENCES[skillName]) {
    expected.set(path.join("references", name), fs.readFileSync(path.join(packageRoot, "references", name)));
  }
  expected.set(path.join("scripts", "knowledge-loom.mjs"), await bundledRunner(packageRoot));
  expected.set(path.join("licenses", "yaml.txt"), fs.readFileSync(path.join(packageRoot, "node_modules", "yaml", "LICENSE")));
  return expected;
}

export function managedFiles(skillRoot) {
  const files = new Set();
  const visit = (root) => {
    if (!fs.existsSync(root)) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const candidate = path.join(root, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile()) files.add(path.relative(skillRoot, candidate));
    }
  };
  for (const directory of ["references", "scripts", "licenses"]) visit(path.join(skillRoot, directory));
  return files;
}

export async function checkSkill(packageRoot, skillName) {
  const skillRoot = path.join(packageRoot, "skills", skillName);
  const expected = await expectedFiles(packageRoot, skillName);
  const errors = [];
  for (const [relative, contents] of expected) {
    const target = path.join(skillRoot, relative);
    if (!fs.statSync(target, { throwIfNoEntry: false })?.isFile()) errors.push(`missing ${target}`);
    else if (!fs.readFileSync(target).equals(contents)) errors.push(`stale ${target}`);
  }
  for (const relative of [...managedFiles(skillRoot)].sort()) {
    if (!expected.has(relative)) errors.push(`unexpected ${path.join(skillRoot, relative)}`);
  }
  return errors;
}

export async function buildSkill(packageRoot, skillName) {
  const skillRoot = path.join(packageRoot, "skills", skillName);
  for (const directory of ["references", "scripts", "licenses"]) {
    fs.rmSync(path.join(skillRoot, directory), { recursive: true, force: true });
  }
  for (const [relative, contents] of await expectedFiles(packageRoot, skillName)) {
    const target = path.join(skillRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    if (relative === path.join("scripts", "knowledge-loom.mjs")) fs.chmodSync(target, 0o755);
  }
}

export async function main(arguments_ = process.argv.slice(2)) {
  const check = arguments_.includes("--check");
  if (arguments_.some((argument) => argument !== "--check")) throw new Error(`unknown argument: ${arguments_.find((argument) => argument !== "--check")}`);
  if (check) {
    const errors = [];
    for (const skillName of Object.keys(SKILL_REFERENCES)) errors.push(...await checkSkill(PACKAGE_ROOT, skillName));
    if (errors.length) {
      for (const error of errors) console.error(`ERROR ${error}`);
      return 1;
    }
    console.log("PASS self-contained skill packages are current");
    return 0;
  }
  for (const skillName of Object.keys(SKILL_REFERENCES)) {
    await buildSkill(PACKAGE_ROOT, skillName);
    console.log(`BUILT skills/${skillName}`);
  }
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((status) => { process.exitCode = status; }).catch((error) => {
    console.error(`ERROR ${error.message}`);
    process.exitCode = 1;
  });
}
