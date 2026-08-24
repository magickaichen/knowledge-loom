import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import { auditVault, matchesPath } from "../src/knowledge-loom/audit.ts";
import { runDeclaredContentCheck } from "../src/knowledge-loom/content-checks.ts";
import { loadVault, renderContract } from "../src/knowledge-loom/contract.ts";
import { copyFixture, FIXTURES, temporaryDirectory } from "./helpers.mjs";

function contentCheckFixture(t, {
  result,
  exitCode = 0,
  rawOutput = null,
  arguments_ = null,
  executable = process.execPath,
} = {}) {
  const temporary = temporaryDirectory(t);
  const root = copyFixture("single-proactive", path.join(temporary, "vault"));
  const vault = loadVault(root);
  const contract = structuredClone(vault.contract);
  contract.content_checks = { adapter: "fictional-content-check" };
  fs.writeFileSync(vault.contractPath, renderContract(contract, vault.body));

  const script = path.join(temporary, "content-check.mjs");
  const outputExpression = rawOutput === null
    ? `JSON.stringify({ ...${JSON.stringify(result)}, root: process.argv[2] })`
    : JSON.stringify(rawOutput);
  fs.writeFileSync(
    script,
    `process.stdout.write(${outputExpression}); process.exitCode = ${exitCode};\n`,
  );

  const registry = path.join(temporary, "registry.yaml");
  fs.writeFileSync(
    registry,
    YAML.stringify({
      schema_version: 1,
      vaults: {},
      content_check_adapters: {
        "fictional-content-check": {
          executable,
          arguments: arguments_ ?? [script, "{vault_root}"],
        },
      },
    }),
  );
  return { root, registry, script };
}

test("clean fixtures have no errors", async () => {
  for (const name of ["single-proactive", "shared-explicit"]) assert.deepEqual(await auditVault(loadVault(path.join(FIXTURES, name))), []);
});

test("declared content checker passes inside the single audit", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
  });
  assert.deepEqual(await auditVault(loadVault(root), { registryPath: registry }), [
    {
      severity: "info",
      code: "content-check.fictional-content-check.passed",
      message: "content check passed (2026-08-12)",
      path: null,
      source: "content-check:fictional-content-check",
      validationDate: "2026-08-12",
    },
  ]);
});

test("declared content checker findings merge with source and line", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: {
      status: "fail",
      validationDate: "2026-08-12",
      findings: [
        {
          severity: "error",
          code: "content.tldr-item-count",
          message: "TL;DR has 2 top-level items; expected 3-5",
          path: "Projects/example.md",
          line: 12,
        },
      ],
    },
    exitCode: 1,
  });
  assert.deepEqual(await auditVault(loadVault(root), { registryPath: registry }), [
    {
      severity: "error",
      code: "content-check.fictional-content-check.content.tldr-item-count",
      message: "TL;DR has 2 top-level items; expected 3-5",
      path: "Projects/example.md",
      line: 12,
      source: "content-check:fictional-content-check",
      validationDate: "2026-08-12",
    },
  ]);
});

test("missing declared content checker is an audit error", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
  });
  fs.writeFileSync(registry, YAML.stringify({ schema_version: 1, vaults: {} }));
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.adapter-missing",
    ),
  );
});

test("built-in errors prevent content checker execution", async (t) => {
  const { root, registry, script } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
  });
  const marker = path.join(path.dirname(script), "checker-ran");
  fs.writeFileSync(
    script,
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
  );
  const vault = loadVault(root);
  const contract = structuredClone(vault.contract);
  contract.instruction_roots = ["missing.md"];
  fs.writeFileSync(vault.contractPath, renderContract(contract, vault.body));

  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "path.instruction-root",
    ),
  );
  assert.equal(fs.existsSync(marker), false);
});

for (const [name, setup, code] of [
  [
    "invalid JSON",
    { result: null, rawOutput: "not json" },
    "content-check.output",
  ],
  [
    "inconsistent exit status",
    { result: { status: "pass", validationDate: "2026-08-12", findings: [] }, exitCode: 1 },
    "content-check.exit-status",
  ],
]) {
  test(`content checker reports ${name}`, async (t) => {
    const { root, registry } = contentCheckFixture(t, setup);
    assert.ok(
      (await auditVault(loadVault(root), { registryPath: registry })).some((item) => item.code === code),
    );
  });
}

test("unsupported adapter placeholders fail before execution", async (t) => {
  const { root, registry, script } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
    arguments_: ["{unknown}"],
  });
  const marker = path.join(path.dirname(script), "checker-ran");
  fs.writeFileSync(
    script,
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
  );
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.adapter-config",
    ),
  );
  assert.equal(fs.existsSync(marker), false);
});

test("content checker rejects a root mismatch", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    rawOutput: JSON.stringify({
      status: "pass",
      root: "/not/the/selected/vault",
      validationDate: "2026-08-12",
      findings: [],
    }),
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.root",
    ),
  );
});

test("content checker rejects a relative root even when invoked from the vault", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    rawOutput: JSON.stringify({
      status: "pass",
      root: ".",
      validationDate: "2026-08-12",
      findings: [],
    }),
  });
  const originalCwd = process.cwd();
  process.chdir(root);
  try {
    assert.ok(
      (await auditVault(loadVault(root), { registryPath: registry })).some(
        (item) => item.code === "content-check.root",
      ),
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test("content checker rejects impossible validation dates", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-99-99", findings: [] },
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.output",
    ),
  );
});

test("content checker requires every finding to declare path or null", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: {
      status: "fail",
      validationDate: "2026-08-12",
      findings: [{ severity: "error", code: "missing-path", message: "missing path" }],
    },
    exitCode: 1,
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.output",
    ),
  );
});

test("content checker rejects findings outside the vault", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: {
      status: "fail",
      validationDate: "2026-08-12",
      findings: [
        {
          severity: "error",
          code: "unsafe-path",
          message: "outside",
          path: "../outside.md",
        },
      ],
    },
    exitCode: 1,
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.output",
    ),
  );
});

test("content checker rejects a finding through a symlink outside the vault", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: {
      status: "fail",
      validationDate: "2026-08-12",
      findings: [
        {
          severity: "error",
          code: "unsafe-symlink",
          message: "outside",
          path: "linked/outside.md",
        },
      ],
    },
    exitCode: 1,
  });
  const outside = temporaryDirectory(t);
  fs.symlinkSync(outside, path.join(root, "linked"), "dir");
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.output",
    ),
  );
});

test("content checker timeout becomes an audit finding", async (t) => {
  const { root, registry, script } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
  });
  fs.writeFileSync(script, "setTimeout(() => {}, 10_000);\n");
  assert.ok(
    (await runDeclaredContentCheck(loadVault(root), { registryPath: registry, timeoutMs: 20 })).some(
      (item) => item.code === "content-check.execution" && /timed out/.test(item.message),
    ),
  );
});

test("content checker timeout remains bounded when the checker handles SIGTERM", async (t) => {
  const { root, registry, script } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
  });
  fs.writeFileSync(
    script,
    'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 1_500);\n',
  );
  const started = Date.now();
  const findings = await runDeclaredContentCheck(loadVault(root), { registryPath: registry, timeoutMs: 300 });
  assert.ok(Date.now() - started < 1_000, "checker exceeded its timeout bound");
  assert.ok(
    findings.some((item) => item.code === "content-check.execution" && /timed out/.test(item.message)),
  );
});

test("content checker launch failure becomes an audit finding", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    result: { status: "pass", validationDate: "2026-08-12", findings: [] },
    executable: path.join(temporaryDirectory(t), "missing-executable"),
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.execution" && /could not start/.test(item.message),
    ),
  );
});

test("content checker output limit becomes an audit finding", async (t) => {
  const { root, registry } = contentCheckFixture(t, {
    rawOutput: "x".repeat(1024 * 1024 + 1),
  });
  assert.ok(
    (await auditVault(loadVault(root), { registryPath: registry })).some(
      (item) => item.code === "content-check.execution",
    ),
  );
});

test("metadata gap is reported", async (t) => {
  const root = copyFixture("shared-explicit", path.join(temporaryDirectory(t), "shared"));
  fs.writeFileSync(path.join(root, "Health", "sam.md"), "# Sam health\n");
  assert.ok((await auditVault(loadVault(root))).some((item) => item.code === "metadata.missing" && item.path === "Health/sam.md"));
});

test("focus limits are reported", async (t) => {
  const root = copyFixture("single-proactive", path.join(temporaryDirectory(t), "single"));
  const focus = path.join(root, "Projects", "current-focus.md");
  fs.writeFileSync(focus, fs.readFileSync(focus, "utf8").replace("\n## Waiting\n", "\n### 3. Hidden parallel task\n\n- **Next action:** Start another stream.\n\n## Waiting\n"));
  const findings = await auditVault(loadVault(root));
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
  test(`audit rejects symlink escape from ${relative}`, async (t) => {
    const temporary = temporaryDirectory(t);
    const root = copyFixture("single-proactive", path.join(temporary, "vault"));
    const target = path.join(root, relative);
    fs.rmSync(target);
    const outside = path.join(temporary, path.basename(target));
    fs.writeFileSync(outside, "---\nstatus: current\n---\n\n# Outside\n");
    fs.symlinkSync(outside, target);
    assert.ok((await auditVault(loadVault(root))).some((item) => item.code === findingCode && item.path === relative));
  });
}

for (const field of ["subjects", "navigation", "metadata_profiles", "history", "privacy", "focus_views"]) {
  test(`malformed ${field} reports errors instead of crashing`, async () => {
    const source = loadVault(path.join(FIXTURES, "single-proactive"));
    const contract = structuredClone(source.contract);
    contract[field] = [];
    const findings = await auditVault({ ...source, contract });
    assert.ok(findings.some((item) => item.severity === "error"));
  });
}

test("privacy pattern rejects a symlinked prefix outside the vault", async (t) => {
  const temporary = temporaryDirectory(t);
  const root = copyFixture("single-proactive", path.join(temporary, "vault"));
  const outside = path.join(temporary, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, "External"), "dir");
  const vault = loadVault(root);
  const contract = structuredClone(vault.contract);
  contract.privacy.never_track = ["External/**"];
  fs.writeFileSync(vault.contractPath, renderContract(contract, vault.body));
  assert.ok((await auditVault(loadVault(root))).some((item) => item.code === "path.privacy-boundary" && item.path === "External/**"));
});
