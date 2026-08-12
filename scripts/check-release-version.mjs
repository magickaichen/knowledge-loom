#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, relative), "utf8"));
}

export function packageVersions() {
  return {
    "package.json": readJson("package.json").version,
    ".codex-plugin/plugin.json": readJson(".codex-plugin/plugin.json").version,
    ".claude-plugin/plugin.json": readJson(".claude-plugin/plugin.json").version,
    ".claude-plugin/marketplace.json": readJson(".claude-plugin/marketplace.json").plugins[0].version,
  };
}

export function validateReleaseTag(tag) {
  const versions = packageVersions();
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) throw new Error(`package versions disagree: ${Object.entries(versions).map(([name, version]) => `${name}=${version}`).join(", ")}`);
  const version = [...unique][0];
  const expected = `v${version}`;
  if (tag !== expected) throw new Error(`release tag ${JSON.stringify(tag)} does not match package version ${JSON.stringify(expected)}`);
  return version;
}

export function changelogNotes(tag) {
  const lines = fs.readFileSync(path.join(PACKAGE_ROOT, "CHANGELOG.md"), "utf8").split(/\r?\n/);
  const heading = `## ${tag}`;
  const headingIndex = lines.indexOf(heading);
  if (headingIndex < 0) throw new Error(`CHANGELOG.md has no ${JSON.stringify(heading)} section`);
  const start = headingIndex + 1;
  const next = lines.findIndex((line, index) => index >= start && line.startsWith("## "));
  const notes = lines.slice(start, next < 0 ? lines.length : next).join("\n").trim();
  if (!notes) throw new Error(`CHANGELOG.md section ${JSON.stringify(heading)} is empty`);
  return `${notes}\n`;
}

export function main(arguments_ = process.argv.slice(2)) {
  if (!arguments_.length) throw new Error("release tag is required");
  const tag = arguments_[0];
  let notesOutput = null;
  for (let index = 1; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--notes-output" || !arguments_[index + 1]) throw new Error(`unknown or incomplete argument: ${arguments_[index]}`);
    notesOutput = arguments_[++index];
  }
  const version = validateReleaseTag(tag);
  const notes = changelogNotes(tag);
  if (notesOutput) {
    const resolved = path.resolve(notesOutput);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, notes, "utf8");
  }
  console.log(`PASS release tag v${version} matches every package manifest`);
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
}
