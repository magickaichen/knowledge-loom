import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import { registerVault, ResolutionError, resolveVault } from "../src/knowledge-loom/registry.mjs";
import { FIXTURES, temporaryDirectory } from "./helpers.mjs";

function writeRegistry(target, vaults) {
  fs.writeFileSync(target, YAML.stringify({ schema_version: 1, vaults }));
}

test("explicit registry ID resolves", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, {
    work: { path: path.join(FIXTURES, "single-proactive") },
    home: { path: path.join(FIXTURES, "shared-explicit") },
  });
  assert.equal(resolveVault("home", { cwd: temporary, registryPath: registry }).contract.vault_id, "shared-home");
});

test("multiple registry candidates are ambiguous", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, {
    work: { path: path.join(FIXTURES, "single-proactive") },
    home: { path: path.join(FIXTURES, "shared-explicit") },
  });
  assert.throws(() => resolveVault(null, { cwd: temporary, registryPath: registry }), (error) => error instanceof ResolutionError && /ambiguous/.test(error.message));
});

test("registration refuses to replace an existing ID", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, { "acme-work": { path: path.join(FIXTURES, "shared-explicit") } });
  assert.throws(() => registerVault("acme-work", path.join(FIXTURES, "single-proactive"), { registryPath: registry, apply: true }), /refusing to replace/);
  assert.equal(YAML.parse(fs.readFileSync(registry, "utf8")).vaults["acme-work"].path, path.join(FIXTURES, "shared-explicit"));
});

test("registration is idempotent for the same ID and path", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  const root = path.join(FIXTURES, "single-proactive");
  registerVault("acme-work", root, { registryPath: registry, apply: true });
  const original = fs.readFileSync(registry);
  registerVault("acme-work", root, { registryPath: registry, apply: true });
  assert.ok(fs.readFileSync(registry).equals(original));
});

test("atomic registration failure preserves the registry", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, { "shared-home": { path: path.join(FIXTURES, "shared-explicit") } });
  const original = fs.readFileSync(registry, "utf8");
  const rename = () => { throw new Error("simulated replace failure"); };
  assert.throws(() => registerVault("acme-work", path.join(FIXTURES, "single-proactive"), { registryPath: registry, apply: true, rename }), /simulated replace failure/);
  assert.equal(fs.readFileSync(registry, "utf8"), original);
  assert.deepEqual(fs.readdirSync(temporary).filter((name) => name.endsWith(".tmp")), []);
});
