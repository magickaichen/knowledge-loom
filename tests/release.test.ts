import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { changelogNotes } from "../scripts/check-release-version.ts";
import { PACKAGE_ROOT, readJson, temporaryDirectory } from "./helpers.ts";

interface PackageManifest {
  version: string;
}

function packageVersion(): string {
  return readJson<PackageManifest>("package.json").version;
}

function runChecker(tag: string, ...extra: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/check-release-version.ts", tag, ...extra], { cwd: PACKAGE_ROOT, encoding: "utf8" });
}

test("release version checker accepts the package version", () => {
  const version = packageVersion();
  const result = runChecker(`v${version}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`PASS release tag v${version}`));
});

test("release version checker rejects a mismatched tag", () => {
  const result = runChecker("v999.0.0");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match package version/);
});

test("release checker writes curated changelog notes", (t) => {
  const version = packageVersion();
  const notes = path.join(temporaryDirectory(t), "release-notes.md");
  const result = runChecker(`v${version}`, "--notes-output", notes);
  assert.equal(result.status, 0, result.stderr);
  const contents = fs.readFileSync(notes, "utf8");
  assert.equal(contents, changelogNotes(`v${version}`));
  assert.doesNotMatch(contents, /Full Changelog/);
});

test("release workflow validates and publishes the Desktop ZIP", () => {
  const workflow = fs.readFileSync(path.join(PACKAGE_ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /tags:\n      - "v\*"/);
  assert.match(workflow, /node --import tsx scripts\/check-release-version\.ts "\$GITHUB_REF_NAME"/);
  assert.match(workflow, /npm run validate/);
  assert.match(workflow, /knowledge-loom-claude-desktop-\$\{GITHUB_REF_NAME\}\.zip/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--verify-tag/);
  assert.match(workflow, /--notes-output "dist\/release-notes\.md"/);
  assert.match(workflow, /--notes-file dist\/release-notes\.md/);
  assert.match(workflow, /--title "\$GITHUB_REF_NAME"/);
  assert.doesNotMatch(workflow, /--generate-notes|setup-uv|python/);
});
