import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { PACKAGE_ROOT, readJson } from "./helpers.ts";

const REPOSITORY = "https://github.com/magickaichen/knowledge-loom";
const PLUGIN_NAME = "knowledge-loom";
const CLAUDE_PLUGIN_SKILLS = [
  "./skills/audit-knowledge-vault",
  "./skills/init-knowledge-vault",
  "./skills/manage-current-focus",
  "./skills/use-knowledge-vault",
];

interface PackageManifest {
  license: string;
  version: string;
  repository: { url: string };
  bin: Record<string, string>;
  scripts: Record<string, string>;
}

interface PackageLock {
  packages: Record<string, { bin?: Record<string, string> }>;
}

interface PluginManifest {
  name: string;
  license: string;
  version: string;
  repository: string;
  skills: string[];
}

interface Marketplace<T> {
  name: string;
  interface?: { displayName: string };
  plugins: T[];
}

interface CodexMarketplaceEntry {
  name: string;
  source: { source: string; url: string; ref: string };
  policy: { installation: string; authentication: string };
  category: string;
}

interface ClaudeMarketplaceEntry {
  name: string;
  source: string;
  version: string;
  repository: string;
  license: string;
}

test("license and package metadata match", () => {
  const project = readJson<PackageManifest>("package.json");
  const lock = readJson<PackageLock>("package-lock.json");
  const codex = readJson<PluginManifest>(".codex-plugin/plugin.json");
  const claude = readJson<PluginManifest>(".claude-plugin/plugin.json");
  assert.equal(project.license, "MIT");
  assert.equal(codex.license, "MIT");
  assert.equal(claude.license, "MIT");
  assert.equal(project.version, codex.version);
  assert.equal(project.version, claude.version);
  assert.equal(project.repository.url.replace(/\.git$/, ""), codex.repository);
  assert.deepEqual(lock.packages[""]?.bin, project.bin);
  assert.equal(codex.repository, claude.repository);
  assert.ok(fs.readFileSync(path.join(PACKAGE_ROOT, "LICENSE"), "utf8").startsWith("MIT License\n\nCopyright (c) 2026 Mike Xiao\n"));
});

test("Codex marketplace points to the root plugin", () => {
  const manifest = readJson<PluginManifest>(".codex-plugin/plugin.json");
  const marketplace = readJson<Marketplace<CodexMarketplaceEntry>>(".agents/plugins/marketplace.json");
  assert.equal(marketplace.name, PLUGIN_NAME);
  assert.deepEqual(marketplace.interface, { displayName: "Knowledge Loom" });
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.ok(entry);
  assert.equal(entry.name, manifest.name);
  assert.deepEqual(entry.source, { source: "url", url: REPOSITORY, ref: "main" });
  assert.deepEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(entry.category, "Productivity");
});

test("Claude marketplace and all-skills group point to the root plugin", () => {
  const manifest = readJson<PluginManifest>(".claude-plugin/plugin.json");
  const marketplace = readJson<Marketplace<ClaudeMarketplaceEntry>>(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, PLUGIN_NAME);
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.ok(entry);
  assert.equal(entry.name, manifest.name);
  assert.equal(entry.source, "./");
  assert.equal(entry.version, manifest.version);
  assert.equal(entry.repository, REPOSITORY);
  assert.equal(entry.license, "MIT");
  assert.deepEqual(manifest.skills, CLAUDE_PLUGIN_SKILLS);
});

test("all handwritten programs are TypeScript and distributed runners are JavaScript", () => {
  const forbidden: string[] = [];
  const mjsFiles: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".venv", "node_modules", "dist", "research"].includes(entry.name)) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else {
        const relative = path.relative(PACKAGE_ROOT, candidate);
        if (entry.name.endsWith(".py") || entry.name === "pyproject.toml" || entry.name === "uv.lock") forbidden.push(relative);
        if (entry.name.endsWith(".mjs")) mjsFiles.push(relative);
      }
    }
  };
  visit(PACKAGE_ROOT);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(mjsFiles.sort(), CLAUDE_PLUGIN_SKILLS.map((skill) => path.join(skill.slice(2), "scripts", "knowledge-loom.mjs")).sort());
  const project = readJson<PackageManifest>("package.json");
  const sourceFiles = fs.readdirSync(path.join(PACKAGE_ROOT, "src", "knowledge-loom"));
  const scriptFiles = fs.readdirSync(path.join(PACKAGE_ROOT, "scripts"));
  const testFiles = fs.readdirSync(path.join(PACKAGE_ROOT, "tests")).filter((name) => name.endsWith(".test.ts") || name === "helpers.ts");
  assert.ok(sourceFiles.length > 0);
  assert.ok(sourceFiles.every((name) => name.endsWith(".ts")));
  assert.ok(scriptFiles.length > 0 && scriptFiles.every((name) => name.endsWith(".ts")));
  assert.ok(testFiles.length > 0 && testFiles.every((name) => name.endsWith(".ts")));
  assert.equal(project.scripts.typecheck, "tsc --noEmit");
  assert.equal(project.scripts["install:skills"], "node --import tsx scripts/install.ts");
  const packageBin = project.bin["knowledge-loom"];
  assert.ok(packageBin);
  assert.match(packageBin, /\.mjs$/);
  assert.doesNotMatch(packageBin, /^src\//);
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
  assert.match(rendered, /`writing-for-agents`.*optional companion, not a prerequisite/);
  assert.match(rendered, /Without the companion, Knowledge Loom applies its built-in agent-readable writing gate/);
  assert.match(readme, /handwritten TypeScript under `src\/`, `scripts\/`, and\s+`tests\/`/);
  assert.match(readme, /one\s+self-contained JavaScript runner/);
  assert.match(readme, /Claude Desktop custom skills use a ZIP upload/);
});
