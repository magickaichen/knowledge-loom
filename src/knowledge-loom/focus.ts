import fs from "node:fs";

import { finding, isUnknownRecord } from "./contract.js";
import { resolveVaultPath } from "./pathing.js";
import type { Finding, FocusView } from "./types.js";

const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;

function activeItems(text: string, sectionName: string): string[] {
  let inSection = false;
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(HEADING_RE);
    if (!match) continue;
    const [, level, title] = match;
    if (!level || !title) continue;
    if (level === "##") {
      inSection = title.trim().toLocaleLowerCase() === sectionName.trim().toLocaleLowerCase();
    } else if (inSection) {
      items.push(title.trim());
    }
  }
  return items;
}

export function parseFocusView(value: unknown): FocusView | null {
  if (
    !isUnknownRecord(value)
    || typeof value.path !== "string"
    || typeof value.subject !== "string"
    || typeof value.max_active !== "number"
    || !Number.isInteger(value.max_active)
    || value.max_active < 1
    || typeof value.max_top !== "number"
    || !Number.isInteger(value.max_top)
    || value.max_top < 1
    || (value.active_section !== undefined && typeof value.active_section !== "string")
    || (value.require_start_here !== undefined && typeof value.require_start_here !== "boolean")
  ) {
    return null;
  }
  return {
    path: value.path,
    subject: value.subject,
    max_active: value.max_active,
    max_top: value.max_top,
    ...(value.active_section === undefined ? {} : { active_section: value.active_section }),
    ...(value.require_start_here === undefined ? {} : { require_start_here: value.require_start_here }),
  };
}

export function checkFocusView(root: string, name: string, view: FocusView): Finding[] {
  const relative = view.path;
  const focusPath = resolveVaultPath(root, relative);
  if (focusPath === null) return [finding("error", "focus.boundary", `focus view \`${name}\` resolves outside the vault`, relative)];
  if (!fs.statSync(focusPath, { throwIfNoEntry: false })?.isFile()) {
    return [finding("error", "focus.missing", `focus view \`${name}\` file is missing`, relative)];
  }

  const section = view.active_section ?? "Top of mind";
  const items = activeItems(fs.readFileSync(focusPath, "utf8"), section);
  const maxTop = view.max_top;
  const maxActive = view.max_active;

  const findings: Finding[] = [];
  if (items.length > maxTop) {
    findings.push(finding("error", "focus.max-top", `focus view \`${name}\` has ${items.length} items; maximum is ${maxTop}`, relative));
  }
  const active = items.filter((item) => !/(?:—|-|\[)\s*next\b/i.test(item));
  if (active.length > maxActive) {
    findings.push(finding("error", "focus.max-active", `focus view \`${name}\` has ${active.length} active items; maximum is ${maxActive}`, relative));
  }
  if (view.require_start_here === true) {
    const starts = items.filter((item) => item.toLocaleLowerCase().includes("start here"));
    if (starts.length !== 1) {
      findings.push(finding("error", "focus.start-here", `focus view \`${name}\` requires exactly one Start here item; found ${starts.length}`, relative));
    }
  }
  return findings;
}
