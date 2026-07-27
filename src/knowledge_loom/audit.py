from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .contract import load_note_frontmatter, validate_contract_data
from .focus import check_focus_view
from .models import Finding, Vault


def _glob_regex(pattern: str) -> re.Pattern[str]:
    index = 0
    result = "^"
    while index < len(pattern):
        char = pattern[index]
        if char == "*":
            if index + 1 < len(pattern) and pattern[index + 1] == "*":
                index += 2
                if index < len(pattern) and pattern[index] == "/":
                    index += 1
                    result += "(?:.*/)?"
                else:
                    result += ".*"
                continue
            result += "[^/]*"
        elif char == "?":
            result += "[^/]"
        else:
            result += re.escape(char)
        index += 1
    return re.compile(result + "$")


def matches_path(pattern: str, path: str) -> bool:
    return bool(_glob_regex(pattern).match(path))


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        text=True,
        capture_output=True,
        check=False,
    )


def audit_vault(vault: Vault) -> list[Finding]:
    findings = validate_contract_data(vault.contract)
    root = vault.root
    contract = vault.contract

    for relative in contract.get("instruction_roots", []):
        if isinstance(relative, str) and not (root / relative).is_file():
            findings.append(Finding("error", "path.instruction-root", "instruction root is missing", relative))

    for relative in contract.get("navigation", {}).get("entrypoints", []):
        if isinstance(relative, str) and not (root / relative).is_file():
            findings.append(Finding("error", "path.navigation", "navigation entrypoint is missing", relative))

    subjects = set(contract.get("subjects", {}).get("values", []))
    mode = contract.get("subjects", {}).get("mode")
    checked: set[tuple[str, str]] = set()
    for profile_name, profile in contract.get("metadata_profiles", {}).items():
        severity = profile.get("severity", "error")
        required = profile.get("required", [])
        for pattern in profile.get("paths", []):
            for path in root.glob(pattern):
                if not path.is_file() or path.suffix.casefold() != ".md":
                    continue
                relative = path.relative_to(root).as_posix()
                key = (profile_name, relative)
                if key in checked:
                    continue
                checked.add(key)
                metadata = load_note_frontmatter(path)
                for field in required:
                    if field not in metadata:
                        findings.append(
                            Finding(
                                severity,
                                "metadata.missing",
                                f"profile `{profile_name}` requires `{field}`",
                                relative,
                            )
                        )
                subject_key = "owner" if "owner" in metadata else "subject" if "subject" in metadata else None
                if mode == "multiple" and subject_key and metadata[subject_key] not in subjects:
                    findings.append(
                        Finding(
                            "error",
                            "metadata.subject",
                            f"`{subject_key}` is not declared in contract subjects",
                            relative,
                        )
                    )

    history_type = contract.get("history", {}).get("type")
    git_check = _git(root, "rev-parse", "--show-toplevel")
    is_git = (
        git_check.returncode == 0
        and bool(git_check.stdout.strip())
        and Path(git_check.stdout.strip()).resolve() == root.resolve()
    )
    if history_type == "git" and not is_git:
        findings.append(Finding("error", "git.missing", "contract requires Git but root is not a Git repository"))
    if history_type == "none" and is_git:
        findings.append(Finding("warning", "git.unconfigured", "root is a Git repository but contract declares no history"))

    if is_git:
        status = _git(root, "status", "--short")
        if status.stdout.strip():
            findings.append(Finding("info", "git.dirty", "working tree has uncommitted changes"))
        tracked = _git(root, "ls-files")
        never_track = contract.get("privacy", {}).get("never_track", [])
        for relative in tracked.stdout.splitlines():
            for pattern in never_track:
                if matches_path(pattern, relative):
                    findings.append(
                        Finding(
                            "error",
                            "privacy.tracked",
                            f"tracked path matches privacy rule `{pattern}`",
                            relative,
                        )
                    )

    for name, view in contract.get("focus_views", {}).items():
        findings.extend(check_focus_view(root, name, view))

    return findings
