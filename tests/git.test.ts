import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { gitOutput } from "../src/knowledge-loom/git.ts";
import { temporaryDirectory } from "./helpers.ts";

test("gitOutput keeps arguments separate and returns stdout", (t) => {
  const root = path.join(temporaryDirectory(t), "repository;still-one-argument");
  fs.mkdirSync(root);

  assert.notEqual(gitOutput(root, ["init", "--initial-branch=main"]), null);
  assert.equal(gitOutput(root, ["rev-parse", "--show-toplevel"])?.trim(), fs.realpathSync(root));
});

test("gitOutput returns null when Git exits non-zero", (t) => {
  const root = temporaryDirectory(t);
  assert.equal(gitOutput(root, ["rev-parse", "--show-toplevel"]), null);
});
