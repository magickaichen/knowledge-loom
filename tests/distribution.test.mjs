import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { PACKAGE_ROOT, readJson } from "./helpers.mjs";

const REPOSITORY = "https://github.com/magickaichen/knowledge-loom";
const PLUGIN_NAME = "knowledge-loom";
const CLAUDE_PLUGIN_SKILLS = [
  "./skills/audit-knowledge-vault",
  "./skills/init-knowledge-vault",
  "./skills/manage-current-focus",
  "./skills/use-knowledge-vault",
];

test("license and package metadata match", () => {
  const project = readJson("package.json");
  const lock = readJson("package-lock.json");
  const codex = readJson(".codex-plugin/plugin.json");
  const claude = readJson(".claude-plugin/plugin.json");
  assert.equal(project.license, "MIT");
  assert.equal(codex.license, "MIT");
  assert.equal(claude.license, "MIT");
  assert.equal(project.version, codex.version);
  assert.equal(project.version, claude.version);
  assert.equal(project.repository.url.replace(/\.git$/, ""), codex.repository);
  assert.deepEqual(lock.packages[""].bin, project.bin);
  assert.equal(codex.repository, claude.repository);
  assert.ok(fs.readFileSync(path.join(PACKAGE_ROOT, "LICENSE"), "utf8").startsWith("MIT License\n\nCopyright (c) 2026 Mike Xiao\n"));
});

test("Codex marketplace points to the root plugin", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  const marketplace = readJson(".agents/plugins/marketplace.json");
  assert.equal(marketplace.name, PLUGIN_NAME);
  assert.deepEqual(marketplace.interface, { displayName: "Knowledge Loom" });
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, manifest.name);
  assert.deepEqual(entry.source, { source: "url", url: REPOSITORY, ref: "main" });
  assert.deepEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(entry.category, "Productivity");
});

test("Claude marketplace and all-skills group point to the root plugin", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  const marketplace = readJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, PLUGIN_NAME);
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, manifest.name);
  assert.equal(entry.source, "./");
  assert.equal(entry.version, manifest.version);
  assert.equal(entry.repository, REPOSITORY);
  assert.equal(entry.license, "MIT");
  assert.deepEqual(manifest.skills, CLAUDE_PLUGIN_SKILLS);
});

test("repository runtime is JavaScript-only", () => {
  const forbidden = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.name.endsWith(".py") || entry.name === "pyproject.toml" || entry.name === "uv.lock") forbidden.push(path.relative(PACKAGE_ROOT, candidate));
    }
  };
  visit(PACKAGE_ROOT);
  assert.deepEqual(forbidden, []);
});

test("README leads with the outcome and explains the no-install runner", () => {
  const readme = fs.readFileSync(path.join(PACKAGE_ROOT, "README.md"), "utf8");
  const opening = readme.slice(0, 800);
  const rendered = readme.split(/\s+/).join(" ");
  assert.match(opening, /Give any agent that supports Agent Skills a safe way/);
  assert.match(opening, /Knowledge Loom is agent-neutral/);
  assert.match(opening, /which vault you meant/);
  assert.ok(readme.indexOf("## Installation") < readme.indexOf("## How it works"));
  assert.ok(readme.indexOf("## Set up your first vault") < readme.indexOf("## How it works"));
  assert.match(rendered, /Installing through both `npx skills` and a plugin/);
  assert.match(readme, /npx skills@latest add magickaichen\/knowledge-loom/);
  assert.doesNotMatch(readme, /--skill '\*'/);
  assert.match(readme, /\$use-knowledge-vault/);
  assert.match(readme, /\/use-knowledge-vault/);
  assert.match(readme, /\$knowledge-loom:use-knowledge-vault/);
  assert.match(readme, /\/knowledge-loom:use-knowledge-vault/);
  assert.match(readme, /~\/\.config\/knowledge-vault\/registry\.yaml/);
  assert.match(readme, /associate example ~\/code\/example-project --apply/);
  assert.match(readme, /There is no second validation command/);
  assert.match(readme, /instruction-only Claude Desktop adapter reports the combined audit as incomplete/);
  assert.match(readme, /content_check_adapters:/);
  assert.match(readme, /Node\.js 20\+/);
  assert.match(readme, /does not run `npm install`/);
  assert.match(readme, /Claude Desktop custom skills use a ZIP upload/);
});
