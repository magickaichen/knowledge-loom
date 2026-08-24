import fs from "node:fs";

import { finding } from "./contract.js";
import { resolveVaultPath } from "./pathing.js";
import type { Finding, UnknownRecord } from "./types.js";

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

export function checkFocusView(root: string, name: string, view: UnknownRecord): Finding[] {
  const relative = view.path;
  if (typeof relative !== "string") return [];
  const focusPath = resolveVaultPath(root, relative);
  if (focusPath === null) return [finding("error", "focus.boundary", `focus view \`${name}\` resolves outside the vault`, relative)];
  if (!fs.statSync(focusPath, { throwIfNoEntry: false })?.isFile()) {
    return [finding("error", "focus.missing", `focus view \`${name}\` file is missing`, relative)];
  }

  const section = view.active_section ?? "Top of mind";
  if (typeof section !== "string") return [];
  const items = activeItems(fs.readFileSync(focusPath, "utf8"), section);
  const maxTop = view.max_top ?? 3;
  const maxActive = view.max_active ?? maxTop;
  if (typeof maxTop !== "number" || typeof maxActive !== "number" || !Number.isInteger(maxTop) || !Number.isInteger(maxActive)) return [];

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
