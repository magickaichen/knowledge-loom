import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadVault } from "../src/knowledge-loom/contract.mjs";
import { buildContract, initializeVault } from "../src/knowledge-loom/initializer.mjs";
import { temporaryDirectory } from "./helpers.mjs";

function contractFor(root, overrides = {}) {
  return buildContract(root, {
    vaultId: "new-vault",
    title: "New Vault",
    subjects: ["owner"],
    writePolicy: "explicit-only",
    currentStatePolicy: "explicit-only",
    historyType: "none",
    adopt: false,
    ...overrides,
  });
}

test("new vault defaults to explicit-only and preview does not write", (t) => {
  const root = path.join(temporaryDirectory(t), "new-vault");
  const contract = contractFor(root);
  const [contractPath] = initializeVault(root, { contract, adopt: false, apply: false });
  assert.equal(fs.existsSync(contractPath), false);
  initializeVault(root, { contract, adopt: false, apply: true });
  assert.equal(loadVault(root).contract.write.policy, "explicit-only");
  assert.ok(fs.statSync(path.join(root, "INDEX.md")).isFile());
});

test("adoption does not rewrite existing content", (t) => {
  const root = path.join(temporaryDirectory(t), "existing");
  fs.mkdirSync(root);
  const note = path.join(root, "legacy.md");
  fs.writeFileSync(note, "legacy content\n");
  const contract = contractFor(root, { vaultId: "existing", title: "Existing", adopt: true });
  initializeVault(root, { contract, adopt: true, apply: true });
  assert.equal(fs.readFileSync(note, "utf8"), "legacy content\n");
});
