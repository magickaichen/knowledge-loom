import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { unzipSync } from "fflate";

import { buildArchive, SKILL_ROOT } from "../scripts/build-claude-desktop-skill.mjs";
import { splitFrontmatter } from "../src/knowledge-loom/contract.mjs";
import { temporaryDirectory } from "./helpers.mjs";

test("Desktop skill metadata states its capability boundary", () => {
  const [metadata, body] = splitFrontmatter(fs.readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8"), { source: "Desktop SKILL.md" });
  assert.equal(metadata.name, path.basename(SKILL_ROOT));
  assert.ok(metadata.description.length <= 200);
  assert.match(metadata.description, /Cowork/);
  assert.match(body, /regular Chat/);
  assert.match(body, /Do not modify the vault/);
  assert.doesNotMatch(body, /\/Users\//);
});

test("Desktop archive has one root and bundled references", (t) => {
  const output = buildArchive(path.join(temporaryDirectory(t), "knowledge-loom.zip"));
  const entries = unzipSync(new Uint8Array(fs.readFileSync(output)));
  assert.deepEqual(Object.keys(entries), [
    "knowledge-loom/SKILL.md",
    "knowledge-loom/references/protocol.md",
    "knowledge-loom/references/contract-schema.md",
  ]);
  const [metadata] = splitFrontmatter(Buffer.from(entries["knowledge-loom/SKILL.md"]).toString("utf8"));
  assert.equal(metadata.name, "knowledge-loom");
});
