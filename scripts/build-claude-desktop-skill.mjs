#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SKILL_ROOT = path.join(PACKAGE_ROOT, "adapters", "claude-desktop", "knowledge-loom");
export const REFERENCE_FILES = [
  path.join(PACKAGE_ROOT, "references", "protocol.md"),
  path.join(PACKAGE_ROOT, "references", "contract-schema.md"),
];
export const ARCHIVE_ROOT = "knowledge-loom";

export function archiveEntries() {
  const sources = [
    [path.join(SKILL_ROOT, "SKILL.md"), `${ARCHIVE_ROOT}/SKILL.md`],
    ...REFERENCE_FILES.map((source) => [source, `${ARCHIVE_ROOT}/references/${path.basename(source)}`]),
  ];
  const missing = sources.filter(([source]) => !fs.statSync(source, { throwIfNoEntry: false })?.isFile()).map(([source]) => source);
  if (missing.length) throw new Error(`missing Desktop skill source: ${missing.join(", ")}`);
  return sources;
}

export function buildArchive(output) {
  const entries = {};
  const options = { level: 9, mtime: new Date("1980-01-02T12:00:00.000Z") };
  for (const [source, destination] of archiveEntries()) entries[destination] = [new Uint8Array(fs.readFileSync(source)), options];
  const resolved = path.resolve(output);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, zipSync(entries));
  return resolved;
}

export function main(arguments_ = process.argv.slice(2)) {
  let output = path.join(PACKAGE_ROOT, "dist", "knowledge-loom-claude-desktop.zip");
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--output" || !arguments_[index + 1]) throw new Error(`unknown or incomplete argument: ${arguments_[index]}`);
    output = arguments_[++index];
  }
  console.log(`BUILT   ${buildArchive(output)}`);
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
}
