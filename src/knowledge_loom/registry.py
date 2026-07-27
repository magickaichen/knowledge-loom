from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from .contract import CONTRACT_NAME, ContractError, load_vault
from .models import Vault


class ResolutionError(ValueError):
    pass


def default_registry_path() -> Path:
    override = os.environ.get("KNOWLEDGE_VAULT_REGISTRY")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "knowledge-vault" / "registry.yaml"


def load_registry(path: Path | None = None) -> dict[str, Any]:
    registry_path = path or default_registry_path()
    if not registry_path.exists():
        return {"schema_version": 1, "vaults": {}}
    try:
        data = yaml.safe_load(registry_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ResolutionError(f"{registry_path}: invalid registry YAML: {exc}") from exc
    if data.get("schema_version") != 1 or not isinstance(data.get("vaults"), dict):
        raise ResolutionError(f"{registry_path}: registry must have schema_version 1 and a vaults mapping")
    return data


def render_registry(data: dict[str, Any]) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)


def find_ancestor_vault(start: Path) -> Path | None:
    current = start.expanduser().resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / CONTRACT_NAME).is_file():
            return candidate
    return None


def _registered_candidates(registry: dict[str, Any]) -> list[tuple[str, Path]]:
    candidates: list[tuple[str, Path]] = []
    for vault_id, record in registry.get("vaults", {}).items():
        if not isinstance(record, dict) or not isinstance(record.get("path"), str):
            continue
        root = Path(record["path"]).expanduser().resolve()
        if (root / CONTRACT_NAME).is_file():
            candidates.append((vault_id, root))
    return candidates


def resolve_vault(
    selector: str | Path | None = None,
    *,
    cwd: Path | None = None,
    registry_path: Path | None = None,
) -> Vault:
    registry = load_registry(registry_path)

    if selector is not None:
        selector_path = Path(selector).expanduser()
        if selector_path.exists():
            root = selector_path if selector_path.is_dir() else selector_path.parent
            return load_vault(root)
        record = registry.get("vaults", {}).get(str(selector))
        if isinstance(record, dict) and isinstance(record.get("path"), str):
            return load_vault(record["path"])
        raise ResolutionError(f"unknown vault selector: {selector}")

    ancestor = find_ancestor_vault(cwd or Path.cwd())
    if ancestor:
        return load_vault(ancestor)

    candidates = _registered_candidates(registry)
    if len(candidates) == 1:
        return load_vault(candidates[0][1])
    if not candidates:
        raise ResolutionError("no vault selected, no ancestor contract found, and registry has no valid vaults")
    ids = ", ".join(vault_id for vault_id, _ in candidates)
    raise ResolutionError(f"vault selection is ambiguous; choose one of: {ids}")


def register_vault(
    vault_id: str,
    root: Path,
    *,
    registry_path: Path | None = None,
    apply: bool = False,
) -> tuple[Path, str]:
    vault = load_vault(root)
    contract_id = vault.contract.get("vault_id")
    if vault_id != contract_id:
        raise ContractError(f"registry ID `{vault_id}` does not match contract ID `{contract_id}`")
    path = registry_path or default_registry_path()
    data = load_registry(path)
    data["vaults"][vault_id] = {"path": str(vault.root)}
    rendered = render_registry(data)
    if apply:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    return path, rendered
