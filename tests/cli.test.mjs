import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import { runCli } from "../src/knowledge-loom/cli.mjs";
import { FIXTURES, temporaryDirectory } from "./helpers.mjs";

function memoryStream() {
  let contents = "";
  return {
    write(value) { contents += value; },
    toString() { return contents; },
  };
}

test("empty invocation remains a usage error", () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  assert.equal(runCli([], { stdout, stderr }), 2);
  assert.equal(stdout.toString(), "");
  assert.match(stderr.toString(), /^ERROR usage: knowledge-loom/);
});

test("explicit help succeeds", () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  assert.equal(runCli(["--help"], { stdout, stderr }), 0);
  assert.match(stdout.toString(), /^usage: knowledge-loom/);
  assert.equal(stderr.toString(), "");
});

test("init expands a literal home path before previewing", () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const relative = path.join("Documents", "knowledge-loom-preview");
  const status = runCli([
    "init", `~/${relative}`, "--vault-id", "preview", "--title", "Preview", "--subject", "owner",
  ], { stdout, stderr });
  assert.equal(status, 0, stderr.toString());
  assert.match(stdout.toString(), new RegExp(`DRY RUN would create ${path.join(os.homedir(), relative).replaceAll("\\", "\\\\")}`));
});

test("associate previews and applies a project-to-vault binding", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  fs.writeFileSync(registry, YAML.stringify({
    schema_version: 1,
    vaults: { "acme-work": { path: path.join(FIXTURES, "single-proactive") } },
  }));

  let stdout = memoryStream();
  let stderr = memoryStream();
  assert.equal(runCli(["associate", "acme-work", project, "--registry", registry], { stdout, stderr }), 0, stderr.toString());
  assert.match(stdout.toString(), /DRY RUN would associate/);
  assert.equal(YAML.parse(fs.readFileSync(registry, "utf8")).projects, undefined);

  stdout = memoryStream();
  stderr = memoryStream();
  assert.equal(runCli(["associate", "acme-work", project, "--registry", registry, "--apply"], { stdout, stderr }), 0, stderr.toString());
  assert.match(stdout.toString(), /associated .* with acme-work/);
  assert.deepEqual(Object.values(YAML.parse(fs.readFileSync(registry, "utf8")).projects), [{ vault_id: "acme-work" }]);
});

test("audit reports declared content checks through the existing command", (t) => {
  const temporary = temporaryDirectory(t);
  const root = path.join(temporary, "vault");
  fs.cpSync(path.join(FIXTURES, "single-proactive"), root, { recursive: true });
  const contractPath = path.join(root, "KNOWLEDGE_VAULT.md");
  fs.writeFileSync(
    contractPath,
    fs.readFileSync(contractPath, "utf8").replace(
      "instruction_roots:",
      "content_checks:\n  adapter: fictional-content-check\ninstruction_roots:",
    ),
  );
  const checker = path.join(temporary, "checker.mjs");
  fs.writeFileSync(
    checker,
    `process.stdout.write(JSON.stringify({ status: "pass", root: process.argv[2], validationDate: "2026-08-12", findings: [] }));\n`,
  );
  const registry = path.join(temporary, "registry.yaml");
  fs.writeFileSync(
    registry,
    YAML.stringify({
      schema_version: 1,
      vaults: {},
      content_check_adapters: {
        "fictional-content-check": {
          executable: process.execPath,
          arguments: [checker, "{vault_root}"],
        },
      },
    }),
  );
  const stdout = memoryStream();
  const stderr = memoryStream();

  assert.equal(
    runCli(["audit", root, "--registry", registry, "--json"], { stdout, stderr }),
    0,
    stderr.toString(),
  );
  assert.deepEqual(JSON.parse(stdout.toString()), [
    {
      severity: "info",
      code: "content-check.fictional-content-check.passed",
      message: "content check passed (2026-08-12)",
      path: null,
      source: "content-check:fictional-content-check",
    },
  ]);
});
