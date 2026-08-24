import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { errorMessage } from "../src/knowledge-loom/errors.ts";
import { isUnknownRecord } from "../src/knowledge-loom/contract.ts";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relative: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, relative), "utf8")) as unknown;
}

function manifestVersion(relative: string): string {
  const manifest = readJson(relative);
  if (!isUnknownRecord(manifest) || typeof manifest.version !== "string") {
    throw new Error(`${relative} requires a string version`);
  }
  return manifest.version;
}

function marketplaceVersion(): string {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  if (!isUnknownRecord(marketplace) || !Array.isArray(marketplace.plugins)) {
    throw new Error(".claude-plugin/marketplace.json requires a plugins list");
  }
  const plugin = marketplace.plugins[0];
  if (!isUnknownRecord(plugin) || typeof plugin.version !== "string") {
    throw new Error(".claude-plugin/marketplace.json requires a plugin version");
  }
  return plugin.version;
}

export function packageVersions(): Record<string, string> {
  return {
    "package.json": manifestVersion("package.json"),
    ".codex-plugin/plugin.json": manifestVersion(".codex-plugin/plugin.json"),
    ".claude-plugin/plugin.json": manifestVersion(".claude-plugin/plugin.json"),
    ".claude-plugin/marketplace.json": marketplaceVersion(),
  };
}

export function validateReleaseTag(tag: string): string {
  const versions = packageVersions();
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) throw new Error(`package versions disagree: ${Object.entries(versions).map(([name, version]) => `${name}=${version}`).join(", ")}`);
  const version = [...unique][0];
  if (!version) throw new Error("package version is missing");
  const expected = `v${version}`;
  if (tag !== expected) throw new Error(`release tag ${JSON.stringify(tag)} does not match package version ${JSON.stringify(expected)}`);
  return version;
}

export function changelogNotes(tag: string): string {
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

export function main(arguments_: string[] = process.argv.slice(2)): number {
  if (!arguments_.length) throw new Error("release tag is required");
  const tag = arguments_[0]!;
  let notesOutput = null;
  for (let index = 1; index < arguments_.length; index += 1) {
    const value = arguments_[index + 1];
    if (arguments_[index] !== "--notes-output" || !value) throw new Error(`unknown or incomplete argument: ${arguments_[index]}`);
    notesOutput = value;
    index += 1;
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
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${errorMessage(error)}`); process.exitCode = 1; }
}
