from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from .models import Finding, Vault
from .pathing import is_vault_relative_path, is_within_vault

CONTRACT_NAME = "KNOWLEDGE_VAULT.md"
VAULT_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class ContractError(ValueError):
    pass


def split_frontmatter(text: str, *, source: str = "<text>") -> tuple[dict[str, Any], str]:
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ContractError(f"{source}: missing opening YAML frontmatter delimiter")

    end = next((index for index, line in enumerate(lines[1:], start=1) if line.strip() == "---"), None)
    if end is None:
        raise ContractError(f"{source}: missing closing YAML frontmatter delimiter")

    raw = "".join(lines[1:end])
    try:
        data = yaml.safe_load(raw) or {}
    except yaml.YAMLError as exc:
        raise ContractError(f"{source}: invalid YAML frontmatter: {exc}") from exc
    if not isinstance(data, dict):
        raise ContractError(f"{source}: frontmatter must be a mapping")
    return data, "".join(lines[end + 1 :])


def load_vault(root: Path | str) -> Vault:
    root_path = Path(root).expanduser().resolve()
    contract_path = root_path / CONTRACT_NAME
    if not contract_path.is_file():
        raise ContractError(f"{contract_path}: contract not found")
    if not is_within_vault(root_path, contract_path):
        raise ContractError(f"{contract_path}: contract resolves outside the vault root")
    data, body = split_frontmatter(contract_path.read_text(encoding="utf-8"), source=str(contract_path))
    return Vault(root=root_path, contract_path=contract_path, contract=data, body=body)


def load_note_frontmatter(path: Path) -> dict[str, Any]:
    try:
        data, _ = split_frontmatter(path.read_text(encoding="utf-8"), source=str(path))
        return data
    except ContractError:
        return {}


def render_contract(data: dict[str, Any], body: str) -> str:
    yaml_text = yaml.safe_dump(
        data,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).rstrip()
    return f"---\n{yaml_text}\n---\n\n{body.strip()}\n"


def _mapping(contract: dict, key: str, findings: list[Finding]) -> dict:
    value = contract.get(key)
    if not isinstance(value, dict):
        findings.append(Finding("error", f"contract.{key}", f"`{key}` must be a mapping"))
        return {}
    return value


def _validate_path_values(
    values: object,
    *,
    field: str,
    findings: list[Finding],
    require_nonempty: bool = False,
) -> list[str]:
    if not isinstance(values, list) or (require_nonempty and not values) or any(
        not isinstance(item, str) for item in values
    ):
        qualifier = "non-empty " if require_nonempty else ""
        findings.append(Finding("error", f"contract.{field}", f"`{field}` must be a {qualifier}string list"))
        return []

    for value in values:
        if not is_vault_relative_path(value):
            findings.append(
                Finding(
                    "error",
                    "contract.path-boundary",
                    f"`{field}` path must stay within the vault root",
                    value,
                )
            )
    return values


def validate_contract_data(contract: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []

    if contract.get("schema_version") != 1:
        findings.append(Finding("error", "contract.schema-version", "`schema_version` must equal 1"))

    vault_id = contract.get("vault_id")
    if not isinstance(vault_id, str) or not VAULT_ID_RE.fullmatch(vault_id):
        findings.append(Finding("error", "contract.vault-id", "`vault_id` must be stable kebab-case"))

    if not isinstance(contract.get("title"), str) or not contract.get("title", "").strip():
        findings.append(Finding("error", "contract.title", "`title` must be a non-empty string"))

    storage = _mapping(contract, "storage", findings)
    if storage and storage.get("type") != "local-markdown":
        findings.append(Finding("error", "contract.storage", "`storage.type` must be `local-markdown`"))

    subjects = _mapping(contract, "subjects", findings)
    mode = subjects.get("mode")
    values = subjects.get("values")
    if mode not in {"single", "multiple"}:
        findings.append(Finding("error", "contract.subject-mode", "`subjects.mode` must be `single` or `multiple`"))
    if not isinstance(values, list) or not values or any(not isinstance(item, str) for item in values):
        findings.append(Finding("error", "contract.subject-values", "`subjects.values` must be a non-empty string list"))
        values = []
    elif len(set(values)) != len(values):
        findings.append(Finding("error", "contract.subject-values", "`subjects.values` must be unique"))
    if mode == "single":
        if len(values) != 1:
            findings.append(Finding("error", "contract.single-subject", "single-subject vaults require exactly one value"))
        if values and subjects.get("default") != values[0]:
            findings.append(Finding("error", "contract.subject-default", "single-subject default must equal its only value"))

    write = _mapping(contract, "write", findings)
    if write and write.get("policy") not in {"explicit-only", "proactive-durable-capture"}:
        findings.append(Finding("error", "contract.write-policy", "unsupported `write.policy`"))
    if write and write.get("current_state_policy") not in {
        "explicit-only",
        "maintain-after-material-change",
    }:
        findings.append(Finding("error", "contract.current-state-policy", "unsupported current-state policy"))

    history = _mapping(contract, "history", findings)
    if history and history.get("type") not in {"git", "none"}:
        findings.append(Finding("error", "contract.history", "`history.type` must be `git` or `none`"))

    sync = _mapping(contract, "sync", findings)
    if sync and sync.get("mode") not in {"none", "git-remote-push", "lifecycle-hook"}:
        findings.append(Finding("error", "contract.sync", "unsupported `sync.mode`"))
    if sync.get("mode") == "lifecycle-hook" and not sync.get("adapter"):
        findings.append(Finding("error", "contract.sync-adapter", "lifecycle sync requires `adapter`"))

    backup = _mapping(contract, "backup", findings)
    if backup and backup.get("mode") not in {"none", "lifecycle-hook"}:
        findings.append(Finding("error", "contract.backup", "unsupported `backup.mode`"))
    if backup.get("mode") == "lifecycle-hook" and not backup.get("adapter"):
        findings.append(Finding("error", "contract.backup-adapter", "lifecycle backup requires `adapter`"))

    _validate_path_values(contract.get("instruction_roots"), field="instruction_roots", findings=findings)

    navigation = _mapping(contract, "navigation", findings)
    _validate_path_values(
        navigation.get("entrypoints"),
        field="navigation.entrypoints",
        findings=findings,
        require_nonempty=True,
    )

    profiles = contract.get("metadata_profiles", {})
    if not isinstance(profiles, dict):
        findings.append(Finding("error", "contract.metadata-profiles", "`metadata_profiles` must be a mapping"))
    else:
        for name, profile in profiles.items():
            if not isinstance(profile, dict):
                findings.append(Finding("error", "contract.metadata-profile", f"profile `{name}` must be a mapping"))
                continue
            paths = profile.get("paths")
            if not isinstance(paths, list) or not paths or any(not isinstance(item, str) for item in paths):
                findings.append(Finding("error", "contract.metadata-paths", f"profile `{name}` requires string paths"))
            else:
                for path in paths:
                    if not is_vault_relative_path(path):
                        findings.append(
                            Finding(
                                "error",
                                "contract.path-boundary",
                                f"metadata profile `{name}` path must stay within the vault root",
                                path,
                            )
                        )
            if not isinstance(profile.get("required"), list):
                findings.append(Finding("error", "contract.metadata-required", f"profile `{name}` requires a field list"))
            if profile.get("severity", "error") not in {"error", "warning"}:
                findings.append(Finding("error", "contract.metadata-severity", f"profile `{name}` has invalid severity"))

    focus_views = contract.get("focus_views", {})
    if not isinstance(focus_views, dict):
        findings.append(Finding("error", "contract.focus-views", "`focus_views` must be a mapping"))
    else:
        subject_values = set(values)
        for name, view in focus_views.items():
            if not isinstance(view, dict):
                findings.append(Finding("error", "contract.focus-view", f"focus view `{name}` must be a mapping"))
                continue
            view_path = view.get("path")
            if not isinstance(view_path, str):
                findings.append(Finding("error", "contract.focus-path", f"focus view `{name}` requires `path`"))
            elif not is_vault_relative_path(view_path):
                findings.append(
                    Finding(
                        "error",
                        "contract.path-boundary",
                        f"focus view `{name}` path must stay within the vault root",
                        view_path,
                    )
                )
            if view.get("subject") not in subject_values:
                findings.append(Finding("error", "contract.focus-subject", f"focus view `{name}` has unknown subject"))
            for key in ("max_active", "max_top"):
                if not isinstance(view.get(key), int) or view[key] < 1:
                    findings.append(Finding("error", f"contract.focus-{key}", f"focus view `{name}` requires positive `{key}`"))
            if isinstance(view.get("max_active"), int) and isinstance(view.get("max_top"), int):
                if view["max_active"] > view["max_top"]:
                    findings.append(Finding("error", "contract.focus-limits", f"focus view `{name}` has max_active > max_top"))

    privacy = contract.get("privacy", {})
    if not isinstance(privacy, dict):
        findings.append(Finding("error", "contract.privacy", "`privacy.never_track` must be a string list"))
    else:
        _validate_path_values(privacy.get("never_track", []), field="privacy.never_track", findings=findings)

    return findings
