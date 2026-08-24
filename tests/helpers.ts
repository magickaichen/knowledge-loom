import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { isUnknownRecord } from "../src/knowledge-loom/contract.ts";
import type { UnknownRecord } from "../src/knowledge-loom/types.ts";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = path.join(PACKAGE_ROOT, "tests", "fixtures");

export function temporaryDirectory(t: TestContext, prefix = "knowledge-loom-test-"): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

export function copyFixture(name: string, destination: string): string {
  fs.cpSync(path.join(FIXTURES, name), destination, { recursive: true });
  return destination;
}

export function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, relative), "utf8")) as T;
}

export function asRecord(value: unknown, description = "value"): UnknownRecord {
  if (!isUnknownRecord(value)) throw new Error(`${description} must be a mapping`);
  return value;
}
