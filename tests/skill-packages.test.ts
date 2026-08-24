import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { checkSkill, managedFiles, SKILL_REFERENCES } from "../scripts/build-skill-packages.ts";
import type { SkillName } from "../scripts/build-skill-packages.ts";
import { splitFrontmatter } from "../src/knowledge-loom/contract.ts";
import { asRecord, FIXTURES, PACKAGE_ROOT, temporaryDirectory } from "./helpers.ts";

const SKILL_NAMES = Object.keys(SKILL_REFERENCES) as SkillName[];

test("generated skill packages are current", async () => {
  for (const skillName of SKILL_NAMES) assert.deepEqual(await checkSkill(PACKAGE_ROOT, skillName), []);
});

for (const skillName of SKILL_NAMES) {
  test(`${skillName} runner works without the source checkout or node_modules`, (t) => {
    const temporary = temporaryDirectory(t);
    const installed = path.join(temporary, "installed", skillName);
    fs.cpSync(path.join(PACKAGE_ROOT, "skills", skillName), installed, { recursive: true });
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const completed = spawnSync(process.execPath, [path.join(installed, "scripts", "knowledge-loom.mjs"), "audit", path.join(FIXTURES, "single-proactive")], {
      cwd: temporary,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(completed.stdout, "PASS no findings\n");
    assert.equal(fs.existsSync(path.join(installed, "node_modules")), false);
  });
}

test("unmanaged runtime files are treated as package drift", (t) => {
  const skillRoot = path.join(temporaryDirectory(t), "skill");
  const unexpected = path.join(skillRoot, "scripts", "unexpected.txt");
  fs.mkdirSync(path.dirname(unexpected), { recursive: true });
  fs.writeFileSync(unexpected, "drift");
  assert.deepEqual([...managedFiles(skillRoot)], [path.join("scripts", "unexpected.txt")]);
});

test("skill frontmatter and plugin manifests match the distribution", () => {
  const skillNames = new Set<string>(SKILL_NAMES);
  for (const skillName of skillNames) {
    const [metadata, body] = splitFrontmatter(fs.readFileSync(path.join(PACKAGE_ROOT, "skills", skillName, "SKILL.md"), "utf8"), { source: skillName });
    assert.deepEqual(new Set(Object.keys(metadata)), new Set(["name", "description"]));
    assert.equal(metadata.name, skillName);
    assert.equal(typeof metadata.description, "string");
    assert.ok((metadata.description as string).trim());
    assert.match(body, /Requires Node\.js 20\+/);
    assert.ok(fs.statSync(path.join(PACKAGE_ROOT, "skills", skillName, "licenses", "yaml.txt")).isFile());
  }
  const codex = asRecord(JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, ".codex-plugin", "plugin.json"), "utf8")) as unknown, "Codex manifest");
  const claude = asRecord(JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, ".claude-plugin", "plugin.json"), "utf8")) as unknown, "Claude manifest");
  assert.equal(codex.name, "knowledge-loom");
  assert.equal(claude.name, "knowledge-loom");
  assert.equal(typeof codex.skills, "string");
  assert.equal(path.resolve(PACKAGE_ROOT, codex.skills as string), path.join(PACKAGE_ROOT, "skills"));
  assert.ok(Array.isArray(claude.skills) && claude.skills.every((entry) => typeof entry === "string"));
  assert.deepEqual(new Set((claude.skills as string[]).map((entry) => path.basename(entry))), skillNames);
});
