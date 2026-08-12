import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function isVaultRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
    return false;
  }
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return !value.split("/").includes("..");
}

export function canonicalPath(value) {
  const absolute = path.resolve(expandHome(String(value)));
  let existing = absolute;
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...missing);
}

export function isWithin(root, candidate) {
  const relative = path.relative(canonicalPath(root), canonicalPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function resolveVaultPath(root, value) {
  if (!isVaultRelativePath(value)) return null;
  try {
    const resolvedRoot = canonicalPath(root);
    const resolved = canonicalPath(path.join(resolvedRoot, ...value.split("/")));
    return isWithin(resolvedRoot, resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function resolveVaultPatternPrefix(root, value) {
  if (!isVaultRelativePath(value)) return null;
  const parts = [];
  for (const part of value.split("/")) {
    if (/[*?[\]]/.test(part)) break;
    parts.push(part);
  }
  return resolveVaultPath(root, parts.length ? parts.join("/") : ".");
}

export function toPosixRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}
