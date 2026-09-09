import { isStableVersion } from "./version.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const SKILLS = ["use-knowledge-vault", "init-knowledge-vault", "audit-knowledge-vault", "manage-current-focus"] as const;

/** Hash the complete tree, including extra files; never follow release symlinks. */
export function fingerprint(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const candidate = path.join(directory, entry.name);
      hash.update(JSON.stringify(path.relative(root, candidate)));
      if (entry.isDirectory()) { hash.update("directory"); visit(candidate); }
      else if (entry.isFile()) { const contents = fs.readFileSync(candidate); hash.update(JSON.stringify(["file", contents.length, fs.statSync(candidate).mode & 0o777])); hash.update(contents); }
      else throw new Error(`unsupported file in bundle: ${candidate}`);
    }
  };
  visit(root);
  return hash.digest("hex");
}

export function validateBundle(root: string): string {
  const manifest: unknown = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string" || !isStableVersion(manifest.version)) throw new Error("invalid stable bundle version");
  let runner: string | undefined;
  for (const name of SKILLS) {
    const skill = path.join(root, "skills", name);
    fingerprint(skill);
    for (const required of ["licenses/yaml.txt", ...(name === "init-knowledge-vault" || name === "audit-knowledge-vault" ? ["references/contract-schema.md"] : [])]) {
      if (!fs.statSync(path.join(skill, required)).isFile()) throw new Error(`missing bundle file: ${required}`);
    }
    if (!fs.readFileSync(path.join(skill, "SKILL.md"), "utf8").includes(`name: ${name}`)) throw new Error(`invalid skill: ${name}`);
    const script = path.join(skill, "scripts", "knowledge-loom.mjs");
    const contents = fs.readFileSync(script, "utf8");
    if (runner !== undefined && contents !== runner) throw new Error("incoherent bundle runners");
    runner = contents;
    if (spawnSync(process.execPath, ["--check", script], { timeout: 10_000 }).status !== 0) throw new Error("invalid bundle runner");
    if (!fs.statSync(path.join(skill, "references", "protocol.md")).isFile()) throw new Error("missing protocol");
  }
  return manifest.version;
}

export function copyBundle(source: string, destination: string): void {
  validateBundle(source);
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(source, "package.json"), path.join(destination, "package.json"));
  for (const name of SKILLS) fs.cpSync(path.join(source, "skills", name), path.join(destination, "skills", name), { recursive: true });
  validateBundle(destination);
}

export interface Advisory { id: string; affectedVersions: string[]; message: string; url: string; }
export function readAdvisories(root: string): Advisory[] {
  const file = path.join(root, "data-integrity-advisories.json");
  if (!fs.existsSync(file)) return [];
  const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new Error("invalid data-integrity advisories");
  return data.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !("message" in item) || typeof item.message !== "string" || !("url" in item) || typeof item.url !== "string" || !item.url.startsWith("https://github.com/magickaichen/knowledge-loom/") || !("affectedVersions" in item) || !Array.isArray(item.affectedVersions) || !item.affectedVersions.every((version: unknown) => typeof version === "string" && isStableVersion(version))) throw new Error("invalid data-integrity advisory");
    return { id: item.id, message: item.message, url: item.url, affectedVersions: item.affectedVersions as string[] };
  });
}
