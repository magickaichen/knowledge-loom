import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import {
  associateProject,
  registerVault,
  ResolutionError,
  resolveApplicableVault,
  resolveVault,
} from "../src/knowledge-loom/registry.ts";
import { FIXTURES, temporaryDirectory } from "./helpers.mjs";

function writeRegistry(target, vaults, projects = undefined) {
  const data = { schema_version: 1, vaults };
  if (projects !== undefined) data.projects = projects;
  fs.writeFileSync(target, YAML.stringify(data));
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

test("applicability probe ignores unassociated registry candidates", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, {
    work: { path: path.join(FIXTURES, "single-proactive") },
    home: { path: path.join(FIXTURES, "shared-explicit") },
  });
  assert.equal(resolveApplicableVault({ cwd: temporary, registryPath: registry }), null);
});

test("project association selects one vault when the registry has multiple candidates", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const nested = path.join(project, "packages", "app");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(nested, { recursive: true });
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
    "shared-home": { path: path.join(FIXTURES, "shared-explicit") },
  }, {
    [project]: { vault_id: "acme-work" },
  });

  assert.equal(resolveVault(null, { cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
  assert.equal(resolveApplicableVault({ cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
});

test("explicit selector takes precedence over a project association", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
    "shared-home": { path: path.join(FIXTURES, "shared-explicit") },
  }, {
    [project]: { vault_id: "acme-work" },
  });

  assert.equal(resolveVault("shared-home", { cwd: project, registryPath: registry }).contract.vault_id, "shared-home");
});

test("explicit registry ID ignores malformed unrelated project associations", (t) => {
  const temporary = temporaryDirectory(t);
  const registry = path.join(temporary, "registry.yaml");
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  }, {
    [path.join(temporary, "unrelated")]: 42,
  });

  assert.equal(resolveVault("acme-work", { cwd: temporary, registryPath: registry }).contract.vault_id, "acme-work");

  fs.writeFileSync(registry, YAML.stringify({
    schema_version: 1,
    vaults: { "acme-work": { path: path.join(FIXTURES, "single-proactive") } },
    projects: [],
  }));
  assert.equal(resolveVault("acme-work", { cwd: temporary, registryPath: registry }).contract.vault_id, "acme-work");
});

test("nearest nested project association wins", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const nested = path.join(project, "packages", "app");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(nested, { recursive: true });
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
    "shared-home": { path: path.join(FIXTURES, "shared-explicit") },
  }, {
    [project]: { vault_id: "shared-home" },
    [path.join(project, "packages")]: { vault_id: "acme-work" },
  });

  assert.equal(resolveVault(null, { cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
});

test("valid nearest association wins over a malformed parent association", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const packages = path.join(project, "packages");
  const nested = path.join(packages, "app");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(nested, { recursive: true });
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  }, {
    [project]: 42,
    [packages]: { vault_id: "acme-work" },
  });

  assert.equal(resolveVault(null, { cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
});

test("nearest vault contract takes precedence over a project association", (t) => {
  const temporary = temporaryDirectory(t);
  const vault = path.join(temporary, "vault");
  const nested = path.join(vault, "notes");
  const registry = path.join(temporary, "registry.yaml");
  fs.cpSync(path.join(FIXTURES, "single-proactive"), vault, { recursive: true });
  fs.mkdirSync(nested);
  writeRegistry(registry, {
    "acme-work": { path: vault },
    "shared-home": { path: path.join(FIXTURES, "shared-explicit") },
  }, {
    [vault]: { vault_id: "shared-home" },
  });

  assert.equal(resolveVault(null, { cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
  assert.equal(resolveApplicableVault({ cwd: nested, registryPath: registry }).contract.vault_id, "acme-work");
});

test("nearest vault contract resolves even when the unrelated registry is malformed", (t) => {
  const temporary = temporaryDirectory(t);
  const vault = path.join(temporary, "vault");
  const registry = path.join(temporary, "registry.yaml");
  fs.cpSync(path.join(FIXTURES, "single-proactive"), vault, { recursive: true });
  fs.writeFileSync(registry, YAML.stringify({ schema_version: 1, vaults: {}, projects: [] }));

  assert.equal(resolveVault(null, { cwd: vault, registryPath: registry }).contract.vault_id, "acme-work");
  assert.equal(resolveVault(vault, { cwd: temporary, registryPath: registry }).contract.vault_id, "acme-work");
});

test("a matching association with an unknown vault ID fails instead of falling back", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  }, {
    [project]: { vault_id: "missing" },
  });

  assert.throws(
    () => resolveVault(null, { cwd: project, registryPath: registry }),
    (error) => error instanceof ResolutionError && /unknown registered vault ID `missing`/.test(error.message),
  );
});

test("a malformed matching project association fails instead of falling back", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  }, {
    [project]: 42,
  });

  assert.throws(
    () => resolveVault(null, { cwd: project, registryPath: registry }),
    (error) => error instanceof ResolutionError && /matching project association .* must contain a vault_id/.test(error.message),
  );
});

test("project association follows canonical paths", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const linked = path.join(temporary, "linked-project");
  const nested = path.join(project, "src");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(nested, { recursive: true });
  fs.symlinkSync(project, linked, "dir");
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  }, {
    [project]: { vault_id: "acme-work" },
  });

  assert.equal(resolveVault(null, { cwd: path.join(linked, "src"), registryPath: registry }).contract.vault_id, "acme-work");
});

test("association previews, applies, and is idempotent", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  });

  const [registryPath, preview] = associateProject("acme-work", project, { registryPath: registry });
  const canonicalProject = fs.realpathSync(project);
  assert.equal(registryPath, registry);
  assert.deepEqual(YAML.parse(preview).projects, { [canonicalProject]: { vault_id: "acme-work" } });
  assert.equal(YAML.parse(fs.readFileSync(registry, "utf8")).projects, undefined);

  associateProject("acme-work", project, { registryPath: registry, apply: true });
  const original = fs.readFileSync(registry);
  associateProject("acme-work", project, { registryPath: registry, apply: true });
  assert.ok(fs.readFileSync(registry).equals(original));
  assert.equal(resolveVault(null, { cwd: project, registryPath: registry }).contract.vault_id, "acme-work");
});

test("association refuses to replace an existing project binding without --replace", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
    "shared-home": { path: path.join(FIXTURES, "shared-explicit") },
  }, {
    [project]: { vault_id: "shared-home" },
  });

  assert.throws(() => associateProject("acme-work", project, { registryPath: registry, apply: true }), /refusing to replace/);
  associateProject("acme-work", project, { registryPath: registry, apply: true, replace: true });
  assert.deepEqual(Object.values(YAML.parse(fs.readFileSync(registry, "utf8")).projects), [{ vault_id: "acme-work" }]);
});

test("atomic association failure preserves the registry", (t) => {
  const temporary = temporaryDirectory(t);
  const project = path.join(temporary, "project");
  const registry = path.join(temporary, "registry.yaml");
  fs.mkdirSync(project);
  writeRegistry(registry, {
    "acme-work": { path: path.join(FIXTURES, "single-proactive") },
  });
  const original = fs.readFileSync(registry, "utf8");
  const rename = () => { throw new Error("simulated replace failure"); };

  assert.throws(() => associateProject("acme-work", project, { registryPath: registry, apply: true, rename }), /simulated replace failure/);
  assert.equal(fs.readFileSync(registry, "utf8"), original);
  assert.deepEqual(fs.readdirSync(temporary).filter((name) => name.endsWith(".tmp")), []);
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
