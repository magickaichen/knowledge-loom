import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { auditVault, matchesPath } from "../src/knowledge-loom/audit.mjs";
import { loadVault, renderContract } from "../src/knowledge-loom/contract.mjs";
import { copyFixture, FIXTURES, temporaryDirectory } from "./helpers.mjs";

test("clean fixtures have no errors", () => {
  for (const name of ["single-proactive", "shared-explicit"]) assert.deepEqual(auditVault(loadVault(path.join(FIXTURES, name))), []);
});

test("metadata gap is reported", (t) => {
  const root = copyFixture("shared-explicit", path.join(temporaryDirectory(t), "shared"));
  fs.writeFileSync(path.join(root, "Health", "sam.md"), "# Sam health\n");
  assert.ok(auditVault(loadVault(root)).some((item) => item.code === "metadata.missing" && item.path === "Health/sam.md"));
});

test("focus limits are reported", (t) => {
  const root = copyFixture("single-proactive", path.join(temporaryDirectory(t), "single"));
  const focus = path.join(root, "Projects", "current-focus.md");
  fs.writeFileSync(focus, fs.readFileSync(focus, "utf8").replace("\n## Waiting\n", "\n### 3. Hidden parallel task\n\n- **Next action:** Start another stream.\n\n## Waiting\n"));
  const findings = auditVault(loadVault(root));
  assert.ok(findings.some((item) => item.code === "focus.max-top"));
  assert.ok(findings.some((item) => item.code === "focus.max-active"));
});

test("double-star patterns match zero or more directories", () => {
  assert.equal(matchesPath("Health/**/*.md", "Health/alex.md"), true);
  assert.equal(matchesPath("Health/**/*.md", "Health/history/alex.md"), true);
  assert.equal(matchesPath("Health/**/*.md", "People/alex.md"), false);
});

test("glob character classes match privacy and metadata paths", () => {
  assert.equal(matchesPath("Private/[ab].md", "Private/a.md"), true);
  assert.equal(matchesPath("Private/[ab].md", "Private/c.md"), false);
  assert.equal(matchesPath("Private/[a-c].md", "Private/b.md"), true);
  assert.equal(matchesPath("Private/[!a].md", "Private/b.md"), true);
  assert.equal(matchesPath("Private/[!a].md", "Private/a.md"), false);
  assert.equal(matchesPath("Private/[]].md", "Private/].md"), true);
  assert.equal(matchesPath("Private/[!]].md", "Private/a.md"), true);
  assert.equal(matchesPath("Private/[!]].md", "Private/].md"), false);
});

for (const [relative, findingCode] of [
  ["AGENTS.md", "path.instruction-boundary"],
  ["INDEX.md", "path.navigation-boundary"],
  ["Projects/current-focus.md", "focus.boundary"],
  ["Projects/parser-project.md", "path.metadata-boundary"],
]) {
  test(`audit rejects symlink escape from ${relative}`, (t) => {
    const temporary = temporaryDirectory(t);
    const root = copyFixture("single-proactive", path.join(temporary, "vault"));
    const target = path.join(root, relative);
    fs.rmSync(target);
    const outside = path.join(temporary, path.basename(target));
    fs.writeFileSync(outside, "---\nstatus: current\n---\n\n# Outside\n");
    fs.symlinkSync(outside, target);
    assert.ok(auditVault(loadVault(root)).some((item) => item.code === findingCode && item.path === relative));
  });
}

for (const field of ["subjects", "navigation", "metadata_profiles", "history", "privacy", "focus_views"]) {
  test(`malformed ${field} reports errors instead of crashing`, () => {
    const source = loadVault(path.join(FIXTURES, "single-proactive"));
    const contract = structuredClone(source.contract);
    contract[field] = [];
    const findings = auditVault({ ...source, contract });
    assert.ok(findings.some((item) => item.severity === "error"));
  });
}

test("privacy pattern rejects a symlinked prefix outside the vault", (t) => {
  const temporary = temporaryDirectory(t);
  const root = copyFixture("single-proactive", path.join(temporary, "vault"));
  const outside = path.join(temporary, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, "External"), "dir");
  const vault = loadVault(root);
  const contract = structuredClone(vault.contract);
  contract.privacy.never_track = ["External/**"];
  fs.writeFileSync(vault.contractPath, renderContract(contract, vault.body));
  assert.ok(auditVault(loadVault(root)).some((item) => item.code === "path.privacy-boundary" && item.path === "External/**"));
});
