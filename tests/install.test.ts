import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { install, SKILLS } from "../scripts/install.ts";
import { PACKAGE_ROOT, temporaryDirectory } from "./helpers.ts";

test("installer creates idempotent links in both runtime directories", (t) => {
  const temporary = temporaryDirectory(t);
  const targets = [path.join(temporary, "agents-skills"), path.join(temporary, "claude-skills")];
  const log = () => {};
  assert.equal(install(PACKAGE_ROOT, targets, { apply: true, log }), 0);
  assert.equal(install(PACKAGE_ROOT, targets, { apply: true, log }), 0);
  for (const target of targets) {
    for (const name of SKILLS) {
      const link = path.join(target, name);
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
      assert.equal(fs.realpathSync(link), path.join(PACKAGE_ROOT, "skills", name));
    }
  }
});

test("installer preflight refuses collision before creating any link", (t) => {
  const temporary = temporaryDirectory(t);
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  const lastSkill = SKILLS.at(-1);
  assert.ok(lastSkill);
  fs.mkdirSync(path.join(second, lastSkill), { recursive: true });
  assert.throws(() => install(PACKAGE_ROOT, [first, second], { apply: true, log: () => {} }), /refusing to replace/);
  assert.equal(fs.existsSync(first), false);
});
