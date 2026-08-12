import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/knowledge-loom/cli.mjs";

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
