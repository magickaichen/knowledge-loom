import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = path.join(PACKAGE_ROOT, "tests", "fixtures");

export function temporaryDirectory(t, prefix = "knowledge-loom-test-") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

export function copyFixture(name, destination) {
  fs.cpSync(path.join(FIXTURES, name), destination, { recursive: true });
  return destination;
}

export function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, relative), "utf8"));
}
