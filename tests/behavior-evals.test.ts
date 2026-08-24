import assert from "node:assert/strict";
import test from "node:test";

import { validateCase } from "../scripts/run-behavior-evals.ts";
import { PACKAGE_ROOT } from "./helpers.ts";

test("behavior validator rejects negated audit pass text through structured classification", () => {
  const case_ = {
    id: "audit",
    skill: "audit-knowledge-vault",
    expected: { selected_skill: "audit-knowledge-vault", audit_classification: "pass" },
  };
  const result = { case_id: "audit", selected_skill: "audit-knowledge-vault", audit_classification: "fail", answer: "did not pass" };
  assert.ok(validateCase(case_, result, PACKAGE_ROOT).some((error) => error.startsWith("audit_classification:")));
});

test("behavior validator observes the canonical installed protocol path", () => {
  const case_ = {
    id: "canonical",
    skill: "use-knowledge-vault",
    expected: { selected_skill: "use-knowledge-vault", resolved_protocol: "skill" },
  };
  const result = {
    case_id: "canonical",
    selected_skill: "use-knowledge-vault",
    resolved_protocol: `${PACKAGE_ROOT}/references/protocol.md`,
    answer: "",
  };
  assert.ok(validateCase(case_, result, PACKAGE_ROOT).some((error) => error.startsWith("resolved_protocol:")));
});

test("behavior validator observes the selected authoring method", () => {
  const case_ = {
    id: "authoring",
    skill: "use-knowledge-vault",
    expected: { selected_skill: "use-knowledge-vault", authoring_method: "writing-for-agents" as const },
  };
  const result = {
    case_id: "authoring",
    selected_skill: "use-knowledge-vault",
    authoring_method: "built-in",
    answer: "",
  };
  assert.ok(validateCase(case_, result, PACKAGE_ROOT).some((error) => error.startsWith("authoring_method:")));
});
