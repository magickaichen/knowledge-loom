import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

import { ContractError } from "./errors.js";
import { canonicalPath, isVaultRelativePath, isWithin } from "./pathing.js";
import type { Finding, FindingSeverity, LoadedVault, UnknownRecord } from "./types.js";

export { ContractError } from "./errors.js";

export const CONTRACT_NAME = "KNOWLEDGE_VAULT.md";
export const KEBAB_CASE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isUnknownRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function finding(
  severity: FindingSeverity,
  code: string,
  message: string,
  findingPath: string | null = null,
): Finding {
  return { severity, code, message, path: findingPath };
}

export function splitFrontmatter(text: string, { source = "<text>" }: { source?: string } = {}): [UnknownRecord, string] {
  const lines = text.match(/.*(?:\r?\n|$)/g)?.filter((line) => line.length) ?? [];
  if (!lines.length || lines[0]!.trim() !== "---") {
    throw new ContractError(`${source}: missing opening YAML frontmatter delimiter`);
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new ContractError(`${source}: missing closing YAML frontmatter delimiter`);

  const raw = lines.slice(1, end).join("");
  let data: unknown;
  try {
    data = YAML.parse(raw) ?? {};
  } catch (error) {
    throw new ContractError(`${source}: invalid YAML frontmatter: ${errorMessage(error)}`, { cause: error });
  }
  if (!isUnknownRecord(data)) {
    throw new ContractError(`${source}: frontmatter must be a mapping`);
  }
  return [data, lines.slice(end + 1).join("")];
}

export function loadVault(root: string): LoadedVault {
  const rootPath = canonicalPath(root);
  const contractPath = path.join(rootPath, CONTRACT_NAME);
  if (!fs.statSync(contractPath, { throwIfNoEntry: false })?.isFile()) {
    throw new ContractError(`${contractPath}: contract not found`);
  }
  if (!isWithin(rootPath, contractPath)) {
    throw new ContractError(`${contractPath}: contract resolves outside the vault root`);
  }
  const [contract, body] = splitFrontmatter(fs.readFileSync(contractPath, "utf8"), { source: contractPath });
  return { root: rootPath, contractPath, contract, body };
}

export function loadNoteFrontmatter(notePath: string): UnknownRecord {
  try {
    return splitFrontmatter(fs.readFileSync(notePath, "utf8"), { source: notePath })[0];
  } catch (error) {
    if (error instanceof ContractError) return {};
    throw error;
  }
}

export function renderContract(data: unknown, body: string): string {
  const yamlText = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlText}\n---\n\n${body.trim()}\n`;
}

function mapping(contract: UnknownRecord, key: string, findings: Finding[]): UnknownRecord {
  const value = contract[key];
  if (!isUnknownRecord(value)) {
    findings.push(finding("error", `contract.${key}`, `\`${key}\` must be a mapping`));
    return {};
  }
  return value;
}

function validatePathValue(value: unknown, description: string, findings: Finding[]): void {
  if (!isVaultRelativePath(value)) {
    findings.push(finding("error", "contract.path-boundary", `${description} must stay within the vault root`, typeof value === "string" ? value : null));
  }
}

function validatePathValues(
  values: unknown,
  { field, findings, requireNonempty = false }: { field: string; findings: Finding[]; requireNonempty?: boolean },
): string[] {
  if (!Array.isArray(values) || (requireNonempty && values.length === 0) || values.some((item) => typeof item !== "string")) {
    const qualifier = requireNonempty ? "non-empty " : "";
    findings.push(finding("error", `contract.${field}`, `\`${field}\` must be a ${qualifier}string list`));
    return [];
  }
  for (const value of values) validatePathValue(value, `\`${field}\` path`, findings);
  return values;
}

export function validateContractData(contract: unknown): Finding[] {
  const findings: Finding[] = [];
  if (!isUnknownRecord(contract)) {
    return [finding("error", "contract.mapping", "contract frontmatter must be a mapping")];
  }
  if (contract.schema_version !== 1) findings.push(finding("error", "contract.schema-version", "`schema_version` must equal 1"));

  const vaultId = contract.vault_id;
  if (typeof vaultId !== "string" || !KEBAB_CASE_ID_RE.test(vaultId)) {
    findings.push(finding("error", "contract.vault-id", "`vault_id` must be stable kebab-case"));
  }
  if (typeof contract.title !== "string" || !contract.title.trim()) {
    findings.push(finding("error", "contract.title", "`title` must be a non-empty string"));
  }

  const storage = mapping(contract, "storage", findings);
  if (Object.keys(storage).length && storage.type !== "local-markdown") {
    findings.push(finding("error", "contract.storage", "`storage.type` must be `local-markdown`"));
  }

  const subjects = mapping(contract, "subjects", findings);
  const mode = subjects.mode;
  let values: string[] = Array.isArray(subjects.values) ? subjects.values.filter((item): item is string => typeof item === "string") : [];
  if (mode !== "single" && mode !== "multiple") {
    findings.push(finding("error", "contract.subject-mode", "`subjects.mode` must be `single` or `multiple`"));
  }
  if (!Array.isArray(subjects.values) || !subjects.values.length || subjects.values.some((item) => typeof item !== "string")) {
    findings.push(finding("error", "contract.subject-values", "`subjects.values` must be a non-empty string list"));
    values = [];
  } else if (new Set(values).size !== values.length) {
    findings.push(finding("error", "contract.subject-values", "`subjects.values` must be unique"));
  }
  if (mode === "single") {
    if (values.length !== 1) findings.push(finding("error", "contract.single-subject", "single-subject vaults require exactly one value"));
    if (values.length && subjects.default !== values[0]) {
      findings.push(finding("error", "contract.subject-default", "single-subject default must equal its only value"));
    }
  }

  const write = mapping(contract, "write", findings);
  if (Object.keys(write).length && write.policy !== "explicit-only" && write.policy !== "proactive-durable-capture") {
    findings.push(finding("error", "contract.write-policy", "unsupported `write.policy`"));
  }
  if (Object.keys(write).length && write.current_state_policy !== "explicit-only" && write.current_state_policy !== "maintain-after-material-change") {
    findings.push(finding("error", "contract.current-state-policy", "unsupported current-state policy"));
  }

  const history = mapping(contract, "history", findings);
  if (Object.keys(history).length && history.type !== "git" && history.type !== "none") {
    findings.push(finding("error", "contract.history", "`history.type` must be `git` or `none`"));
  }

  const sync = mapping(contract, "sync", findings);
  if (Object.keys(sync).length && sync.mode !== "none" && sync.mode !== "git-remote-push" && sync.mode !== "lifecycle-hook") {
    findings.push(finding("error", "contract.sync", "unsupported `sync.mode`"));
  }
  if (sync.mode === "lifecycle-hook" && !sync.adapter) {
    findings.push(finding("error", "contract.sync-adapter", "lifecycle sync requires `adapter`"));
  }

  const backup = mapping(contract, "backup", findings);
  if (Object.keys(backup).length && backup.mode !== "none" && backup.mode !== "lifecycle-hook") {
    findings.push(finding("error", "contract.backup", "unsupported `backup.mode`"));
  }
  if (backup.mode === "lifecycle-hook" && !backup.adapter) {
    findings.push(finding("error", "contract.backup-adapter", "lifecycle backup requires `adapter`"));
  }

  if (Object.hasOwn(contract, "content_checks")) {
    const contentChecks = mapping(contract, "content_checks", findings);
    if (
      contract.content_checks
      && typeof contract.content_checks === "object"
      && !Array.isArray(contract.content_checks)
      && (
        typeof contentChecks.adapter !== "string"
        || !KEBAB_CASE_ID_RE.test(contentChecks.adapter)
      )
    ) {
      findings.push(
        finding(
          "error",
          "contract.content-check-adapter",
          "`content_checks.adapter` must be a kebab-case ID",
        ),
      );
    }
  }

  validatePathValues(contract.instruction_roots, { field: "instruction_roots", findings });
  const navigation = mapping(contract, "navigation", findings);
  validatePathValues(navigation.entrypoints, { field: "navigation.entrypoints", findings, requireNonempty: true });

  const profiles = contract.metadata_profiles ?? {};
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    findings.push(finding("error", "contract.metadata-profiles", "`metadata_profiles` must be a mapping"));
  } else {
    for (const [name, profile] of Object.entries(profiles)) {
      if (!isUnknownRecord(profile)) {
        findings.push(finding("error", "contract.metadata-profile", `profile \`${name}\` must be a mapping`));
        continue;
      }
      if (!Array.isArray(profile.paths) || !profile.paths.length || profile.paths.some((item: unknown) => typeof item !== "string")) {
        findings.push(finding("error", "contract.metadata-paths", `profile \`${name}\` requires string paths`));
      } else {
        for (const profilePath of profile.paths) validatePathValue(profilePath, `metadata profile \`${name}\` path`, findings);
      }
      if (!Array.isArray(profile.required)) findings.push(finding("error", "contract.metadata-required", `profile \`${name}\` requires a field list`));
      if (profile.severity !== undefined && profile.severity !== "error" && profile.severity !== "warning") {
        findings.push(finding("error", "contract.metadata-severity", `profile \`${name}\` has invalid severity`));
      }
    }
  }

  const focusViews = contract.focus_views ?? {};
  if (!focusViews || typeof focusViews !== "object" || Array.isArray(focusViews)) {
    findings.push(finding("error", "contract.focus-views", "`focus_views` must be a mapping"));
  } else {
    const subjectValues = new Set(values);
    for (const [name, view] of Object.entries(focusViews)) {
      if (!isUnknownRecord(view)) {
        findings.push(finding("error", "contract.focus-view", `focus view \`${name}\` must be a mapping`));
        continue;
      }
      if (typeof view.path !== "string") findings.push(finding("error", "contract.focus-path", `focus view \`${name}\` requires \`path\``));
      else validatePathValue(view.path, `focus view \`${name}\` path`, findings);
      if (typeof view.subject !== "string" || !subjectValues.has(view.subject)) findings.push(finding("error", "contract.focus-subject", `focus view \`${name}\` has unknown subject`));
      for (const key of ["max_active", "max_top"] as const) {
        const value = view[key];
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) findings.push(finding("error", `contract.focus-${key}`, `focus view \`${name}\` requires positive \`${key}\``));
      }
      if (typeof view.max_active === "number" && typeof view.max_top === "number" && Number.isInteger(view.max_active) && Number.isInteger(view.max_top) && view.max_active > view.max_top) {
        findings.push(finding("error", "contract.focus-limits", `focus view \`${name}\` has max_active > max_top`));
      }
    }
  }

  const privacy = contract.privacy ?? {};
  if (!isUnknownRecord(privacy)) {
    findings.push(finding("error", "contract.privacy", "`privacy.never_track` must be a string list"));
  } else {
    validatePathValues(privacy.never_track ?? [], { field: "privacy.never_track", findings });
  }
  return findings;
}
