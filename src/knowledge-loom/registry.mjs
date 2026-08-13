import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import { CONTRACT_NAME, loadVault } from "./contract.mjs";
import { ContractError, ResolutionError } from "./errors.mjs";
import { canonicalPath, expandHome, isWithin } from "./pathing.mjs";

export { ResolutionError } from "./errors.mjs";

export function defaultRegistryPath() {
  return process.env.KNOWLEDGE_VAULT_REGISTRY
    ? path.resolve(expandHome(process.env.KNOWLEDGE_VAULT_REGISTRY))
    : path.join(os.homedir(), ".config", "knowledge-vault", "registry.yaml");
}

export function loadRegistry(registryPath = defaultRegistryPath()) {
  const resolved = path.resolve(expandHome(String(registryPath)));
  if (!fs.existsSync(resolved)) return { schema_version: 1, vaults: {} };
  let data;
  try {
    data = YAML.parse(fs.readFileSync(resolved, "utf8")) ?? {};
  } catch (error) {
    throw new ResolutionError(`${resolved}: invalid registry YAML: ${error.message}`, { cause: error });
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.schema_version !== 1 || !data.vaults || typeof data.vaults !== "object" || Array.isArray(data.vaults)) {
    throw new ResolutionError(`${resolved}: registry must have schema_version 1 and a vaults mapping`);
  }
  return data;
}

export function renderRegistry(data) {
  return YAML.stringify(data, { lineWidth: 0 });
}

export function atomicWriteText(targetPath, rendered, { rename = fs.renameSync } = {}) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  let descriptor;
  try {
    const existing = fs.statSync(targetPath, { throwIfNoEntry: false });
    descriptor = fs.openSync(temporary, "wx", existing?.mode & 0o777 || 0o600);
    fs.writeFileSync(descriptor, rendered, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    rename(temporary, targetPath);
    try {
      const directory = fs.openSync(path.dirname(targetPath), "r");
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    } catch {
      // Some filesystems do not support syncing directories.
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

export function findAncestorVault(start) {
  let current = canonicalPath(start);
  if (fs.statSync(current, { throwIfNoEntry: false })?.isFile()) current = path.dirname(current);
  while (true) {
    if (fs.statSync(path.join(current, CONTRACT_NAME), { throwIfNoEntry: false })?.isFile()) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function registeredCandidates(registry) {
  const candidates = [];
  for (const [vaultId, record] of Object.entries(registry.vaults ?? {})) {
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.path !== "string") continue;
    const root = canonicalPath(record.path);
    if (fs.statSync(path.join(root, CONTRACT_NAME), { throwIfNoEntry: false })?.isFile()) candidates.push([vaultId, root]);
  }
  return candidates;
}

function registeredVault(vaultId, registry) {
  const record = registry.vaults[vaultId];
  if (!record) throw new ResolutionError(`unknown registered vault ID \`${vaultId}\``);
  if (typeof record !== "object" || Array.isArray(record) || typeof record.path !== "string") {
    throw new ResolutionError(`invalid registered vault record \`${vaultId}\``);
  }
  const vault = loadVault(record.path);
  if (vault.contract.vault_id !== vaultId) {
    throw new ResolutionError(`registered vault ID \`${vaultId}\` does not match contract ID \`${vault.contract.vault_id}\``);
  }
  return vault;
}

function projectAssociation(start, registry) {
  if (registry.projects === undefined) return null;
  if (!registry.projects || typeof registry.projects !== "object" || Array.isArray(registry.projects)) {
    throw new ResolutionError("registry projects must be a mapping");
  }
  let current = canonicalPath(start);
  if (fs.statSync(current, { throwIfNoEntry: false })?.isFile()) current = path.dirname(current);
  const matches = [];
  for (const [configuredRoot, record] of Object.entries(registry.projects ?? {})) {
    const expandedRoot = expandHome(configuredRoot);
    if (!path.isAbsolute(expandedRoot)) continue;
    const root = canonicalPath(expandedRoot);
    if (!isWithin(root, current)) continue;
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.vault_id !== "string" || !record.vault_id) {
      throw new ResolutionError(`matching project association \`${configuredRoot}\` must contain a vault_id`);
    }
    const relative = path.relative(root, current);
    const distance = relative ? relative.split(path.sep).length : 0;
    matches.push({ record, distance });
  }
  if (!matches.length) return null;
  const nearestDistance = Math.min(...matches.map((match) => match.distance));
  const nearest = matches.filter((match) => match.distance === nearestDistance);
  const vaultIds = new Set(nearest.map((match) => match.record.vault_id));
  if (vaultIds.size > 1) {
    throw new ResolutionError(`project association is ambiguous at \`${current}\`; matching roots resolve to: ${[...vaultIds].sort().join(", ")}`);
  }
  return nearest[0];
}

export function resolveVault(selector = null, { cwd = process.cwd(), registryPath = defaultRegistryPath() } = {}) {
  if (selector !== null && selector !== undefined) {
    const selectorPath = path.resolve(expandHome(String(selector)));
    if (fs.existsSync(selectorPath)) {
      const root = fs.statSync(selectorPath).isDirectory() ? selectorPath : path.dirname(selectorPath);
      return loadVault(root);
    }
    const registry = loadRegistry(registryPath);
    const record = registry.vaults[String(selector)];
    if (record && typeof record === "object" && !Array.isArray(record) && typeof record.path === "string") return loadVault(record.path);
    throw new ResolutionError(`unknown vault selector: ${selector}`);
  }

  const ancestor = findAncestorVault(cwd);
  if (ancestor) return loadVault(ancestor);
  const registry = loadRegistry(registryPath);
  const association = projectAssociation(cwd, registry);
  if (association) return registeredVault(association.record.vault_id, registry);
  const candidates = registeredCandidates(registry);
  if (candidates.length === 1) return loadVault(candidates[0][1]);
  if (!candidates.length) throw new ResolutionError("no vault selected, no ancestor contract found, and registry has no valid vaults");
  throw new ResolutionError(`vault selection is ambiguous; choose one of: ${candidates.map(([vaultId]) => vaultId).join(", ")}`);
}

export function registerVault(vaultId, root, { registryPath = defaultRegistryPath(), apply = false, rename = fs.renameSync } = {}) {
  const vault = loadVault(root);
  const contractId = vault.contract.vault_id;
  if (vaultId !== contractId) throw new ContractError(`registry ID \`${vaultId}\` does not match contract ID \`${contractId}\``);
  const resolvedRegistryPath = path.resolve(expandHome(String(registryPath)));
  const data = loadRegistry(resolvedRegistryPath);
  const existing = data.vaults[vaultId];
  if (existing !== undefined) {
    if (!existing || typeof existing !== "object" || Array.isArray(existing) || typeof existing.path !== "string") {
      throw new ResolutionError(`registry ID \`${vaultId}\` already exists with an invalid record`);
    }
    const existingRoot = canonicalPath(existing.path);
    if (existingRoot !== vault.root) {
      throw new ResolutionError(`registry ID \`${vaultId}\` already points to \`${existingRoot}\`; refusing to replace it with \`${vault.root}\``);
    }
  }
  data.vaults[vaultId] = { path: vault.root };
  const rendered = renderRegistry(data);
  if (apply) {
    const current = fs.existsSync(resolvedRegistryPath) ? fs.readFileSync(resolvedRegistryPath, "utf8") : null;
    if (current !== rendered) atomicWriteText(resolvedRegistryPath, rendered, { rename });
  }
  return [resolvedRegistryPath, rendered];
}

export function associateProject(vaultId, projectRoot, {
  registryPath = defaultRegistryPath(),
  apply = false,
  replace = false,
  rename = fs.renameSync,
} = {}) {
  const normalizedVaultId = String(vaultId);
  const resolvedRegistryPath = path.resolve(expandHome(String(registryPath)));
  const data = loadRegistry(resolvedRegistryPath);
  registeredVault(normalizedVaultId, data);

  const root = canonicalPath(projectRoot);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ResolutionError(`project path is not an existing directory: ${root}`);
  }

  if (data.projects !== undefined && (!data.projects || typeof data.projects !== "object" || Array.isArray(data.projects))) {
    throw new ResolutionError("registry projects must be a mapping");
  }
  data.projects ??= {};
  for (const [configuredRoot, record] of Object.entries(data.projects)) {
    const expandedRoot = expandHome(configuredRoot);
    if (!path.isAbsolute(expandedRoot)) {
      throw new ResolutionError(`project association path must be absolute: ${configuredRoot}`);
    }
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.vault_id !== "string" || !record.vault_id) {
      throw new ResolutionError(`project association \`${configuredRoot}\` must contain a vault_id`);
    }
    if (canonicalPath(expandedRoot) !== root) continue;
    if (record.vault_id !== normalizedVaultId && !replace) {
      throw new ResolutionError(`project \`${root}\` already points to \`${record.vault_id}\`; refusing to replace it with \`${normalizedVaultId}\``);
    }
    if (configuredRoot !== root) delete data.projects[configuredRoot];
  }
  data.projects[root] = { vault_id: normalizedVaultId };

  const rendered = renderRegistry(data);
  if (apply) {
    const current = fs.existsSync(resolvedRegistryPath) ? fs.readFileSync(resolvedRegistryPath, "utf8") : null;
    if (current !== rendered) atomicWriteText(resolvedRegistryPath, rendered, { rename });
  }
  return [resolvedRegistryPath, rendered, root];
}
