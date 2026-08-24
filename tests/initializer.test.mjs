import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadVault } from "../src/knowledge-loom/contract.ts";
import { buildContract, initializeVault } from "../src/knowledge-loom/initializer.ts";
import { temporaryDirectory } from "./helpers.mjs";

function contractFor(root, overrides = {}) {
  return buildContract(root, {
    vaultId: "new-vault",
    title: "New Vault",
    subjects: ["owner"],
    writePolicy: "proactive-durable-capture",
    currentStatePolicy: "maintain-after-material-change",
    historyType: "none",
    adopt: false,
    ...overrides,
  });
}

test("new vault uses proactive policies and preview does not write", (t) => {
  const root = path.join(temporaryDirectory(t), "new-vault");
  const contract = contractFor(root);
  const [contractPath] = initializeVault(root, { contract, adopt: false, apply: false });
  assert.equal(fs.existsSync(contractPath), false);
  initializeVault(root, { contract, adopt: false, apply: true });
  assert.equal(loadVault(root).contract.write.policy, "proactive-durable-capture");
  assert.equal(loadVault(root).contract.write.current_state_policy, "maintain-after-material-change");
  assert.ok(fs.statSync(path.join(root, "INDEX.md")).isFile());
});

test("new vault can explicitly opt out of proactive policies", (t) => {
  const root = path.join(temporaryDirectory(t), "explicit-vault");
  const contract = contractFor(root, {
    writePolicy: "explicit-only",
    currentStatePolicy: "explicit-only",
  });
  initializeVault(root, { contract, adopt: false, apply: true });
  assert.deepEqual(loadVault(root).contract.write, {
    policy: "explicit-only",
    current_state_policy: "explicit-only",
  });
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
