from pathlib import Path

import pytest
import yaml

from knowledge_loom.registry import ResolutionError, resolve_vault

FIXTURES = Path(__file__).parent / "fixtures"


def test_explicit_registry_id_resolves(tmp_path: Path) -> None:
    registry = tmp_path / "registry.yaml"
    registry.write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "vaults": {
                    "work": {"path": str(FIXTURES / "single-proactive")},
                    "home": {"path": str(FIXTURES / "shared-explicit")},
                },
            }
        ),
        encoding="utf-8",
    )
    vault = resolve_vault("home", cwd=tmp_path, registry_path=registry)
    assert vault.contract["vault_id"] == "shared-home"


def test_multiple_registry_candidates_are_ambiguous(tmp_path: Path) -> None:
    registry = tmp_path / "registry.yaml"
    registry.write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "vaults": {
                    "work": {"path": str(FIXTURES / "single-proactive")},
                    "home": {"path": str(FIXTURES / "shared-explicit")},
                },
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ResolutionError, match="ambiguous"):
        resolve_vault(cwd=tmp_path, registry_path=registry)
