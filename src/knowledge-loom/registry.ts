import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import { CONTRACT_NAME, isUnknownRecord, loadVault } from "./contract.js";
import { ContractError, ResolutionError } from "./errors.js";
import { canonicalPath, expandHome, isWithin } from "./pathing.js";
import type { LoadedVault, Registry, UnknownRecord } from "./types.js";

export { ResolutionError } from "./errors.js";

export function defaultRegistryPath() {
  return process.env.KNOWLEDGE_VAULT_REGISTRY
    ? path.resolve(expandHome(process.env.KNOWLEDGE_VAULT_REGISTRY))
    : path.join(os.homedir(), ".config", "knowledge-vault", "registry.yaml");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadRegistry(registryPath: string | undefined = defaultRegistryPath()): Registry {
  const resolved = path.resolve(expandHome(String(registryPath)));
  if (!fs.existsSync(resolved)) return { schema_version: 1, vaults: {} };
  let data: unknown;
  try {
    data = YAML.parse(fs.readFileSync(resolved, "utf8")) ?? {};
  } catch (error) {
    throw new ResolutionError(`${resolved}: invalid registry YAML: ${errorMessage(error)}`, { cause: error });
  }
  if (!isUnknownRecord(data) || data.schema_version !== 1 || !isUnknownRecord(data.vaults)) {
    throw new ResolutionError(`${resolved}: registry must have schema_version 1 and a vaults mapping`);
  }
  return { ...data, schema_version: 1, vaults: data.vaults };
}

export function renderRegistry(data: Registry): string {
  return YAML.stringify(data, { lineWidth: 0 });
}

type Rename = (oldPath: string, newPath: string) => void;

export function atomicWriteText(
  targetPath: string,
  rendered: string,
  { rename = fs.renameSync }: { rename?: Rename } = {},
): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  let descriptor;
  try {
    const existing = fs.statSync(targetPath, { throwIfNoEntry: false });
    descriptor = fs.openSync(temporary, "wx", existing ? existing.mode & 0o777 : 0o600);
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

export function findAncestorVault(start: string): string | null {
  let current = canonicalPath(start);
  if (fs.statSync(current, { throwIfNoEntry: false })?.isFile()) current = path.dirname(current);
  while (true) {
    if (fs.statSync(path.join(current, CONTRACT_NAME), { throwIfNoEntry: false })?.isFile()) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function registeredCandidates(registry: Registry): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];
  for (const [vaultId, record] of Object.entries(registry.vaults ?? {})) {
    if (!isUnknownRecord(record) || typeof record.path !== "string") continue;
    const root = canonicalPath(record.path);
    if (fs.statSync(path.join(root, CONTRACT_NAME), { throwIfNoEntry: false })?.isFile()) candidates.push([vaultId, root]);
  }
  return candidates;
}

function registeredVault(vaultId: string, registry: Registry): LoadedVault {
  const record = registry.vaults[vaultId];
  if (!record) throw new ResolutionError(`unknown registered vault ID \`${vaultId}\``);
  if (!isUnknownRecord(record) || typeof record.path !== "string") {
    throw new ResolutionError(`invalid registered vault record \`${vaultId}\``);
  }
  const vault = loadVault(record.path);
  if (vault.contract.vault_id !== vaultId) {
    throw new ResolutionError(`registered vault ID \`${vaultId}\` does not match contract ID \`${vault.contract.vault_id}\``);
  }
  return vault;
}

function requireProjectsMapping(projects: unknown): UnknownRecord {
  if (!isUnknownRecord(projects)) {
    throw new ResolutionError("registry projects must be a mapping");
  }
  return projects;
}

function projectRecord(
  configuredRoot: string,
  record: unknown,
  { matching = false }: { matching?: boolean } = {},
): UnknownRecord & { vault_id: string } {
  if (!isUnknownRecord(record) || typeof record.vault_id !== "string" || !record.vault_id) {
    throw new ResolutionError(`${matching ? "matching " : ""}project association \`${configuredRoot}\` must contain a vault_id`);
  }
  return { ...record, vault_id: record.vault_id };
}

interface ProjectMatch {
  configuredRoot: string;
  record: unknown;
  distance: number;
}

function projectAssociation(start: string, registry: Registry): ProjectMatch | null {
  if (registry.projects === undefined) return null;
  const projects = requireProjectsMapping(registry.projects);
  let current = canonicalPath(start);
  if (fs.statSync(current, { throwIfNoEntry: false })?.isFile()) current = path.dirname(current);
  const matches: ProjectMatch[] = [];
  for (const [configuredRoot, record] of Object.entries(projects)) {
    const expandedRoot = expandHome(configuredRoot);
    if (!path.isAbsolute(expandedRoot)) continue;
    const root = canonicalPath(expandedRoot);
    if (!isWithin(root, current)) continue;
    const relative = path.relative(root, current);
    const distance = relative ? relative.split(path.sep).length : 0;
    matches.push({ configuredRoot, record, distance });
  }
  if (!matches.length) return null;
  const nearestDistance = Math.min(...matches.map((match) => match.distance));
  const nearest = matches.filter((match) => match.distance === nearestDistance);
  const vaultIds = new Set(nearest.map((match) => projectRecord(match.configuredRoot, match.record, { matching: true }).vault_id));
  if (vaultIds.size > 1) {
    throw new ResolutionError(`project association is ambiguous at \`${current}\`; matching roots resolve to: ${[...vaultIds].sort().join(", ")}`);
  }
  return nearest[0] ?? null;
}

function applicableVaultContext(cwd: string, registryPath: string | undefined): { vault: LoadedVault | null; registry: Registry | null } {
  const ancestor = findAncestorVault(cwd);
  if (ancestor) return { vault: loadVault(ancestor), registry: null };
  const registry = loadRegistry(registryPath);
  const association = projectAssociation(cwd, registry);
  const vault = association ? registeredVault(projectRecord(association.configuredRoot, association.record).vault_id, registry) : null;
  return { vault, registry };
}

export function resolveVault(
  selector: string | null = null,
  { cwd = process.cwd(), registryPath = defaultRegistryPath() }: { cwd?: string | undefined; registryPath?: string | undefined } = {},
): LoadedVault {
  if (selector !== null && selector !== undefined) {
    const selectorPath = path.resolve(expandHome(String(selector)));
    if (fs.existsSync(selectorPath)) {
      const root = fs.statSync(selectorPath).isDirectory() ? selectorPath : path.dirname(selectorPath);
      return loadVault(root);
    }
    const registry = loadRegistry(registryPath);
    const record = registry.vaults[String(selector)];
    if (isUnknownRecord(record) && typeof record.path === "string") return loadVault(record.path);
    throw new ResolutionError(`unknown vault selector: ${selector}`);
  }

  const { vault, registry } = applicableVaultContext(cwd, registryPath);
  if (vault) return vault;
  if (!registry) throw new ResolutionError("internal error: registry unavailable after vault resolution");
  const candidates = registeredCandidates(registry);
  if (candidates.length === 1) return loadVault(candidates[0]![1]);
  if (!candidates.length) throw new ResolutionError("no vault selected, no ancestor contract found, and registry has no valid vaults");
  throw new ResolutionError(`vault selection is ambiguous; choose one of: ${candidates.map(([vaultId]) => vaultId).join(", ")}`);
}

export function resolveApplicableVault(
  { cwd = process.cwd(), registryPath = defaultRegistryPath() }: { cwd?: string | undefined; registryPath?: string | undefined } = {},
): LoadedVault | null {
  return applicableVaultContext(cwd, registryPath).vault;
}

export function registerVault(
  vaultId: string,
  root: string,
  { registryPath = defaultRegistryPath(), apply = false, rename = fs.renameSync }: { registryPath?: string | undefined; apply?: boolean | undefined; rename?: Rename | undefined } = {},
): [string, string] {
  const vault = loadVault(root);
  const contractId = vault.contract.vault_id;
  if (vaultId !== contractId) throw new ContractError(`registry ID \`${vaultId}\` does not match contract ID \`${contractId}\``);
  const resolvedRegistryPath = path.resolve(expandHome(String(registryPath)));
  const data = loadRegistry(resolvedRegistryPath);
  const existing = data.vaults[vaultId];
  if (existing !== undefined) {
    if (!isUnknownRecord(existing) || typeof existing.path !== "string") {
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

export function associateProject(vaultId: string, projectRoot: string, {
  registryPath = defaultRegistryPath(),
  apply = false,
  replace = false,
  rename = fs.renameSync,
}: { registryPath?: string | undefined; apply?: boolean | undefined; replace?: boolean | undefined; rename?: Rename | undefined } = {}): [string, string, string] {
  const normalizedVaultId = String(vaultId);
  const resolvedRegistryPath = path.resolve(expandHome(String(registryPath)));
  const data = loadRegistry(resolvedRegistryPath);
  registeredVault(normalizedVaultId, data);

  const root = canonicalPath(projectRoot);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ResolutionError(`project path is not an existing directory: ${root}`);
  }

  data.projects ??= {};
  const projects = requireProjectsMapping(data.projects);
  for (const [configuredRoot, unvalidatedRecord] of Object.entries(projects)) {
    const expandedRoot = expandHome(configuredRoot);
    if (!path.isAbsolute(expandedRoot)) {
      throw new ResolutionError(`project association path must be absolute: ${configuredRoot}`);
    }
    const record = projectRecord(configuredRoot, unvalidatedRecord);
    if (canonicalPath(expandedRoot) !== root) continue;
    if (record.vault_id !== normalizedVaultId && !replace) {
      throw new ResolutionError(`project \`${root}\` already points to \`${record.vault_id}\`; refusing to replace it with \`${normalizedVaultId}\``);
    }
    if (configuredRoot !== root) delete projects[configuredRoot];
  }
  projects[root] = { vault_id: normalizedVaultId };

  const rendered = renderRegistry(data);
  if (apply) {
    const current = fs.existsSync(resolvedRegistryPath) ? fs.readFileSync(resolvedRegistryPath, "utf8") : null;
    if (current !== rendered) atomicWriteText(resolvedRegistryPath, rendered, { rename });
  }
  return [resolvedRegistryPath, rendered, root];
}
