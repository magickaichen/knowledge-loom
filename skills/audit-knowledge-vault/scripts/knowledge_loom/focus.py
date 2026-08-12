from __future__ import annotations

import re
from pathlib import Path

from .models import Finding
from .pathing import resolve_vault_path

HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$")


def _active_items(text: str, section_name: str) -> list[str]:
    in_section = False
    items: list[str] = []
    for line in text.splitlines():
        match = HEADING_RE.match(line)
        if not match:
            continue
        level, title = match.groups()
        if level == "##":
            in_section = title.strip().casefold() == section_name.strip().casefold()
            continue
        if in_section and level == "###":
            items.append(title.strip())
    return items


def check_focus_view(root: Path, name: str, view: dict) -> list[Finding]:
    findings: list[Finding] = []
    relative = view.get("path")
    if not isinstance(relative, str):
        return findings
    path = resolve_vault_path(root, relative)
    if path is None:
        return [Finding("error", "focus.boundary", f"focus view `{name}` resolves outside the vault", relative)]
    if not path.is_file():
        return [Finding("error", "focus.missing", f"focus view `{name}` file is missing", relative)]

    text = path.read_text(encoding="utf-8")
    section = view.get("active_section", "Top of mind")
    if not isinstance(section, str):
        return findings
    items = _active_items(text, section)
    max_top = view.get("max_top", 3)
    max_active = view.get("max_active", max_top)
    if not isinstance(max_top, int) or not isinstance(max_active, int):
        return findings

    if len(items) > max_top:
        findings.append(
            Finding("error", "focus.max-top", f"focus view `{name}` has {len(items)} items; maximum is {max_top}", relative)
        )

    active = [item for item in items if not re.search(r"(?:—|-|\[)\s*next\b", item, flags=re.IGNORECASE)]
    if len(active) > max_active:
        findings.append(
            Finding(
                "error",
                "focus.max-active",
                f"focus view `{name}` has {len(active)} active items; maximum is {max_active}",
                relative,
            )
        )

    if view.get("require_start_here", False):
        starts = [item for item in items if "start here" in item.casefold()]
        if len(starts) != 1:
            findings.append(
                Finding(
                    "error",
                    "focus.start-here",
                    f"focus view `{name}` requires exactly one Start here item; found {len(starts)}",
                    relative,
                )
            )
    return findings
