import fs from "node:fs";
import path from "node:path";

import { finding, isUnknownRecord, loadNoteFrontmatter, validateContractData } from "./contract.js";
import { runDeclaredContentCheck } from "./content-checks.js";
import { errorMessage } from "./errors.js";
import { checkFocusView, parseFocusView } from "./focus.js";
import { gitOutput } from "./git.js";
import {
  canonicalPath,
  isVaultRelativePath,
  isWithin,
  resolveVaultPath,
  resolveVaultPatternPrefix,
  toPosixRelative,
} from "./pathing.js";
import type { Finding, FindingSeverity, LoadedVault } from "./types.js";

function escapeRegex(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function globRegex(pattern: string, { characterClasses = true }: { characterClasses?: boolean } = {}): RegExp {
  let index = 0;
  let result = "^";
  while (index < pattern.length) {
    const character = pattern[index]!;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 2;
        if (pattern[index] === "/") {
          index += 1;
          result += "(?:.*/)?";
        } else {
          result += ".*";
        }
        continue;
      }
      result += "[^/]*";
    } else if (character === "?") {
      result += "[^/]";
    } else if (character === "[" && characterClasses) {
      let close = index + 1;
      if (["!", "^"].includes(pattern[close] ?? "")) close += 1;
      if (pattern[close] === "]") close += 1;
      close = pattern.indexOf("]", close);
      if (close < 0) {
        result += "\\[";
      } else {
        let contents = pattern.slice(index + 1, close);
        let prefix = "";
        if (contents.startsWith("!")) {
          prefix = "^";
          contents = contents.slice(1);
        } else if (contents.startsWith("^")) {
          contents = `\\${contents}`;
        }
        let escapedContents = contents.replaceAll("\\", "\\\\").replaceAll("[", "\\[");
        if (escapedContents.startsWith("]")) escapedContents = `\\${escapedContents}`;
        result += `[${prefix}${escapedContents}]`;
        index = close;
      }
    } else {
      result += escapeRegex(character);
    }
    index += 1;
  }
  try {
    return new RegExp(`${result}$`);
  } catch (error) {
    if (!characterClasses) throw error;
    return globRegex(pattern, { characterClasses: false });
  }
}

export function matchesPath(pattern: string, candidate: string): boolean {
  return globRegex(pattern).test(candidate);
}

interface DeclaredFilesOptions {
  boundaryCode: string;
  boundaryMessage: string;
  missingCode: string;
  missingMessage: string;
}

function auditDeclaredFiles(root: string, values: unknown, {
  boundaryCode,
  boundaryMessage,
  missingCode,
  missingMessage,
}: DeclaredFilesOptions): Finding[] {
  if (!Array.isArray(values)) return [];
  const findings: Finding[] = [];
  for (const relative of values) {
    if (typeof relative !== "string" || !isVaultRelativePath(relative)) continue;
    const resolved = resolveVaultPath(root, relative);
    if (resolved === null) findings.push(finding("error", boundaryCode, boundaryMessage, relative));
    else if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) findings.push(finding("error", missingCode, missingMessage, relative));
  }
  return findings;
}

function patternPrefix(patternValue: string): string[] {
  const parts: string[] = [];
  for (const part of patternValue.split("/")) {
    if (/[*?[\]]/.test(part)) break;
    parts.push(part);
  }
  return parts;
}

function walk(root: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(root)) return result;
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      result.push(candidate);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(candidate);
    }
  };
  if (fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink()) visit(root);
  else result.push(root);
  return result;
}

function globPaths(root: string, patternValue: string): string[] {
  if (!/[*?[]/.test(patternValue)) {
    const candidate = path.join(root, ...patternValue.split("/"));
    return fs.existsSync(candidate) ? [candidate] : [];
  }
  const prefix = patternPrefix(patternValue);
  const searchRoot = path.join(root, ...prefix);
  return walk(searchRoot).filter((candidate) => matchesPath(patternValue, toPosixRelative(root, candidate)));
}

export async function auditVault(
  vault: LoadedVault,
  { registryPath }: { registryPath?: string | undefined } = {},
): Promise<Finding[]> {
  const findings = validateContractData(vault.contract);
  const { root, contract } = vault;

  findings.push(...auditDeclaredFiles(root, contract.instruction_roots ?? [], {
    boundaryCode: "path.instruction-boundary",
    boundaryMessage: "instruction root resolves outside the vault",
    missingCode: "path.instruction-root",
    missingMessage: "instruction root is missing",
  }));

  const navigation = isUnknownRecord(contract.navigation) ? contract.navigation : {};
  findings.push(...auditDeclaredFiles(root, navigation.entrypoints ?? [], {
    boundaryCode: "path.navigation-boundary",
    boundaryMessage: "navigation entrypoint resolves outside the vault",
    missingCode: "path.navigation",
    missingMessage: "navigation entrypoint is missing",
  }));

  const subjectConfig = isUnknownRecord(contract.subjects) ? contract.subjects : {};
  const subjectValues = Array.isArray(subjectConfig.values)
    ? subjectConfig.values.filter((value): value is string => typeof value === "string")
    : [];
  const subjects = new Set(subjectValues);
  const profiles = isUnknownRecord(contract.metadata_profiles) ? contract.metadata_profiles : {};
  const checked = new Set<string>();
  for (const [profileName, profile] of Object.entries(profiles)) {
    if (!isUnknownRecord(profile)) continue;
    const severity: FindingSeverity = profile.severity === "warning" ? "warning" : "error";
    const required = Array.isArray(profile.required)
      ? profile.required.filter((value): value is string => typeof value === "string")
      : [];
    const patterns = Array.isArray(profile.paths) ? profile.paths : [];
    for (const patternValue of patterns) {
      if (typeof patternValue !== "string" || !isVaultRelativePath(patternValue)) continue;
      if (resolveVaultPatternPrefix(root, patternValue) === null) {
        findings.push(finding("error", "path.metadata-boundary", `profile \`${profileName}\` path prefix resolves outside the vault`, patternValue));
        continue;
      }
      let paths;
      try {
        paths = globPaths(root, patternValue);
      } catch (error) {
        findings.push(finding("error", "metadata.pattern", `profile \`${profileName}\` has an unusable path pattern: ${errorMessage(error)}`, patternValue));
        continue;
      }
      for (const candidate of paths) {
        const relative = toPosixRelative(root, candidate);
        if (!isWithin(root, candidate)) {
          findings.push(finding("error", "path.metadata-boundary", `profile \`${profileName}\` matched a file outside the vault`, relative));
          continue;
        }
        if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile() || path.extname(candidate).toLocaleLowerCase() !== ".md") continue;
        const key = `${profileName}\0${relative}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const metadata = loadNoteFrontmatter(candidate);
        for (const field of required) {
          if (!Object.hasOwn(metadata, field)) findings.push(finding(severity, "metadata.missing", `profile \`${profileName}\` requires \`${field}\``, relative));
        }
        const subjectKey = Object.hasOwn(metadata, "owner") ? "owner" : Object.hasOwn(metadata, "subject") ? "subject" : null;
        const metadataSubject = subjectKey ? metadata[subjectKey] : undefined;
        if (subjectConfig.mode === "multiple" && subjectKey && (typeof metadataSubject !== "string" || !subjects.has(metadataSubject))) {
          findings.push(finding("error", "metadata.subject", `\`${subjectKey}\` is not declared in contract subjects`, relative));
        }
      }
    }
  }

  const privacy = isUnknownRecord(contract.privacy) ? contract.privacy : {};
  const neverTrack = Array.isArray(privacy.never_track) ? privacy.never_track : [];
  const validNeverTrack: string[] = [];
  for (const patternValue of neverTrack) {
    if (typeof patternValue !== "string" || !isVaultRelativePath(patternValue)) continue;
    if (resolveVaultPatternPrefix(root, patternValue) === null) {
      findings.push(finding("error", "path.privacy-boundary", "privacy path prefix resolves outside the vault", patternValue));
      continue;
    }
    validNeverTrack.push(patternValue);
  }

  const history = isUnknownRecord(contract.history) ? contract.history : {};
  const gitRoot = gitOutput(root, ["rev-parse", "--show-toplevel"])?.trim() ?? "";
  const isGit = Boolean(gitRoot) && canonicalPath(gitRoot) === canonicalPath(root);
  if (history.type === "git" && !isGit) findings.push(finding("error", "git.missing", "contract requires Git but root is not a Git repository"));
  if (history.type === "none" && isGit) findings.push(finding("warning", "git.unconfigured", "root is a Git repository but contract declares no history"));

  if (isGit) {
    const statusOutput = gitOutput(root, ["status", "--short"]);
    if (statusOutput?.trim()) findings.push(finding("info", "git.dirty", "working tree has uncommitted changes"));
    const trackedFilesOutput = gitOutput(root, ["ls-files"]);
    for (const relative of (trackedFilesOutput ?? "").split(/\r?\n/).filter(Boolean)) {
      for (const patternValue of validNeverTrack) {
        if (matchesPath(patternValue, relative)) findings.push(finding("error", "privacy.tracked", `tracked path matches privacy rule \`${patternValue}\``, relative));
      }
    }
  }

  const focusViews = isUnknownRecord(contract.focus_views) ? contract.focus_views : {};
  for (const [name, value] of Object.entries(focusViews)) {
    const view = parseFocusView(value);
    if (!view || !isVaultRelativePath(view.path)) continue;
    findings.push(...checkFocusView(root, name, view));
  }
  if (!findings.some((item) => item.severity === "error")) {
    findings.push(...await runDeclaredContentCheck(vault, { registryPath }));
  }
  return findings;
}
