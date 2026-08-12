import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { checkSkill, managedFiles, SKILL_REFERENCES } from "../scripts/build-skill-packages.mjs";
import { splitFrontmatter } from "../src/knowledge-loom/contract.mjs";
import { FIXTURES, PACKAGE_ROOT, temporaryDirectory } from "./helpers.mjs";

test("generated skill packages are current", async () => {
  for (const skillName of Object.keys(SKILL_REFERENCES)) assert.deepEqual(await checkSkill(PACKAGE_ROOT, skillName), []);
});

for (const skillName of Object.keys(SKILL_REFERENCES)) {
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
  const skillNames = new Set(Object.keys(SKILL_REFERENCES));
  for (const skillName of skillNames) {
    const [metadata] = splitFrontmatter(fs.readFileSync(path.join(PACKAGE_ROOT, "skills", skillName, "SKILL.md"), "utf8"), { source: skillName });
    assert.deepEqual(new Set(Object.keys(metadata)), new Set(["name", "description", "compatibility"]));
    assert.equal(metadata.name, skillName);
    assert.ok(metadata.description.trim());
    assert.match(metadata.compatibility, /Node\.js 20\+/);
    assert.ok(fs.statSync(path.join(PACKAGE_ROOT, "skills", skillName, "licenses", "yaml.txt")).isFile());
  }
  const codex = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, ".codex-plugin", "plugin.json"), "utf8"));
  const claude = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(codex.name, "knowledge-loom");
  assert.equal(claude.name, "knowledge-loom");
  assert.equal(path.resolve(PACKAGE_ROOT, codex.skills), path.join(PACKAGE_ROOT, "skills"));
  assert.deepEqual(new Set(claude.skills.map((entry) => path.basename(entry))), skillNames);
});
