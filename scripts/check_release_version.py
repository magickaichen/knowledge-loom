#!/usr/bin/env python3
"""Verify that a release tag matches every public package version."""

from __future__ import annotations

import argparse
import json
import tomllib
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def package_versions() -> dict[str, str]:
    project = tomllib.loads((PACKAGE_ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    codex = json.loads((PACKAGE_ROOT / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    claude = json.loads((PACKAGE_ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
    marketplace = json.loads(
        (PACKAGE_ROOT / ".claude-plugin/marketplace.json").read_text(encoding="utf-8")
    )
    return {
        "pyproject.toml": project["version"],
        ".codex-plugin/plugin.json": codex["version"],
        ".claude-plugin/plugin.json": claude["version"],
        ".claude-plugin/marketplace.json": marketplace["plugins"][0]["version"],
    }


def validate_release_tag(tag: str) -> str:
    versions = package_versions()
    unique_versions = set(versions.values())
    if len(unique_versions) != 1:
        details = ", ".join(f"{path}={version}" for path, version in versions.items())
        raise ValueError(f"package versions disagree: {details}")

    version = unique_versions.pop()
    expected_tag = f"v{version}"
    if tag != expected_tag:
        raise ValueError(f"release tag {tag!r} does not match package version {expected_tag!r}")
    return version


def changelog_notes(tag: str) -> str:
    lines = (PACKAGE_ROOT / "CHANGELOG.md").read_text(encoding="utf-8").splitlines()
    heading = f"## {tag}"
    try:
        start = lines.index(heading) + 1
    except ValueError as error:
        raise ValueError(f"CHANGELOG.md has no {heading!r} section") from error

    end = next(
        (index for index in range(start, len(lines)) if lines[index].startswith("## ")),
        len(lines),
    )
    notes = "\n".join(lines[start:end]).strip()
    if not notes:
        raise ValueError(f"CHANGELOG.md section {heading!r} is empty")
    return f"{notes}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag", help="release tag in vX.Y.Z form")
    parser.add_argument(
        "--notes-output",
        type=Path,
        help="write the matching CHANGELOG.md section to this file",
    )
    args = parser.parse_args()
    version = validate_release_tag(args.tag)
    notes = changelog_notes(args.tag)
    if args.notes_output is not None:
        args.notes_output.parent.mkdir(parents=True, exist_ok=True)
        args.notes_output.write_text(notes, encoding="utf-8")
    print(f"PASS release tag v{version} matches every package manifest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
