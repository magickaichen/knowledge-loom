from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .contract import load_note_frontmatter, validate_contract_data
from .focus import check_focus_view
from .models import Finding, Vault
from .pathing import is_vault_relative_path, is_within_vault, resolve_vault_path


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

    instruction_roots = contract.get("instruction_roots", [])
    if not isinstance(instruction_roots, list):
        instruction_roots = []
    for relative in instruction_roots:
        if not isinstance(relative, str) or not is_vault_relative_path(relative):
            continue
        resolved = resolve_vault_path(root, relative)
        if resolved is None:
            findings.append(
                Finding("error", "path.instruction-boundary", "instruction root resolves outside the vault", relative)
            )
        elif not resolved.is_file():
            findings.append(Finding("error", "path.instruction-root", "instruction root is missing", relative))

    navigation = contract.get("navigation", {})
    if not isinstance(navigation, dict):
        navigation = {}
    entrypoints = navigation.get("entrypoints", [])
    if not isinstance(entrypoints, list):
        entrypoints = []
    for relative in entrypoints:
        if not isinstance(relative, str) or not is_vault_relative_path(relative):
            continue
        resolved = resolve_vault_path(root, relative)
        if resolved is None:
            findings.append(
                Finding("error", "path.navigation-boundary", "navigation entrypoint resolves outside the vault", relative)
            )
        elif not resolved.is_file():
            findings.append(Finding("error", "path.navigation", "navigation entrypoint is missing", relative))

    subject_config = contract.get("subjects", {})
    if not isinstance(subject_config, dict):
        subject_config = {}
    subject_values = subject_config.get("values", [])
    subjects = set(subject_values) if isinstance(subject_values, list) else set()
    mode = subject_config.get("mode")
    checked: set[tuple[str, str]] = set()
    profiles = contract.get("metadata_profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}
    for profile_name, profile in profiles.items():
        if not isinstance(profile, dict):
            continue
        severity = profile.get("severity", "error")
        required = profile.get("required", [])
        if not isinstance(required, list):
            required = []
        patterns = profile.get("paths", [])
        if not isinstance(patterns, list):
            patterns = []
        for pattern in patterns:
            if not isinstance(pattern, str) or not is_vault_relative_path(pattern):
                continue
            try:
                matches = root.glob(pattern)
                paths = list(matches)
            except (OSError, RuntimeError, ValueError) as exc:
                findings.append(
                    Finding(
                        "error",
                        "metadata.pattern",
                        f"profile `{profile_name}` has an unusable path pattern: {exc}",
                        pattern,
                    )
                )
                continue
            for path in paths:
                if not path.is_file() or path.suffix.casefold() != ".md":
                    continue
                if not is_within_vault(root, path):
                    findings.append(
                        Finding(
                            "error",
                            "path.metadata-boundary",
                            f"profile `{profile_name}` matched a file outside the vault",
                            path.relative_to(root).as_posix(),
                        )
                    )
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

    history = contract.get("history", {})
    history_type = history.get("type") if isinstance(history, dict) else None
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
        privacy = contract.get("privacy", {})
        never_track = privacy.get("never_track", []) if isinstance(privacy, dict) else []
        if not isinstance(never_track, list):
            never_track = []
        for relative in tracked.stdout.splitlines():
            for pattern in never_track:
                if isinstance(pattern, str) and is_vault_relative_path(pattern) and matches_path(pattern, relative):
                    findings.append(
                        Finding(
                            "error",
                            "privacy.tracked",
                            f"tracked path matches privacy rule `{pattern}`",
                            relative,
                        )
                    )

    focus_views = contract.get("focus_views", {})
    if not isinstance(focus_views, dict):
        focus_views = {}
    for name, view in focus_views.items():
        if not isinstance(view, dict) or not isinstance(view.get("path"), str):
            continue
        if not is_vault_relative_path(view["path"]):
            continue
        findings.extend(check_focus_view(root, name, view))

    return findings
