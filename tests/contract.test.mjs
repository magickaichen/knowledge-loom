import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ContractError, loadVault, renderContract, validateContractData } from "../src/knowledge-loom/contract.ts";
import { FIXTURES, temporaryDirectory } from "./helpers.mjs";

test("fixture contracts are valid", () => {
  for (const name of ["single-proactive", "shared-explicit"]) assert.deepEqual(validateContractData(loadVault(path.join(FIXTURES, name)).contract), []);
});

test("shared and single-subject write policies remain distinct", () => {
  const shared = loadVault(path.join(FIXTURES, "shared-explicit")).contract;
  assert.equal(shared.subjects.mode, "multiple");
  assert.equal(Object.hasOwn(shared.subjects, "default"), false);
  const single = loadVault(path.join(FIXTURES, "single-proactive")).contract;
  assert.equal(single.write.policy, "proactive-durable-capture");
  assert.equal(single.write.current_state_policy, "maintain-after-material-change");
});

test("content checks accept one kebab-case adapter ID", () => {
  const contract = structuredClone(loadVault(path.join(FIXTURES, "single-proactive")).contract);
  contract.content_checks = { adapter: "fictional-content-check" };
  assert.deepEqual(validateContractData(contract), []);
});

for (const contentChecks of [[], {}, { adapter: "Not Valid" }]) {
  test(`content checks reject ${JSON.stringify(contentChecks)}`, () => {
    const contract = structuredClone(loadVault(path.join(FIXTURES, "single-proactive")).contract);
    contract.content_checks = contentChecks;
    assert.ok(
      validateContractData(contract).some((item) => item.code.startsWith("contract.content")),
    );
  });
}

for (const [field, value] of [
  ["instruction", "/etc/hosts"],
  ["navigation", "../INDEX.md"],
  ["metadata", "Projects/../../outside/*.md"],
  ["focus", "C:\\outside\\focus.md"],
  ["privacy", "../Local-Only/**"],
]) {
  test(`contract rejects ${field} path outside the vault`, () => {
    const contract = structuredClone(loadVault(path.join(FIXTURES, "single-proactive")).contract);
    if (field === "instruction") contract.instruction_roots = [value];
    else if (field === "navigation") contract.navigation.entrypoints = [value];
    else if (field === "metadata") contract.metadata_profiles["project-note"].paths = [value];
    else if (field === "focus") contract.focus_views.work.path = value;
    else contract.privacy.never_track = [value];
    assert.ok(validateContractData(contract).some((item) => item.code === "contract.path-boundary" && item.path === value));
  });
}

test("contract file cannot be a symlink outside the vault", (t) => {
  const temporary = temporaryDirectory(t);
  const root = path.join(temporary, "vault");
  fs.mkdirSync(root);
  const source = loadVault(path.join(FIXTURES, "single-proactive"));
  const outside = path.join(temporary, "outside-contract.md");
  fs.writeFileSync(outside, renderContract(source.contract, source.body));
  fs.symlinkSync(outside, path.join(root, "KNOWLEDGE_VAULT.md"));
  assert.throws(() => loadVault(root), (error) => error instanceof ContractError && /outside the vault root/.test(error.message));
});
