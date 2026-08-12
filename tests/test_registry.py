from pathlib import Path

import pytest
import yaml

import knowledge_loom.registry as registry_module
from knowledge_loom.registry import ResolutionError, register_vault, resolve_vault

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


def test_registration_refuses_to_replace_an_existing_id(tmp_path: Path) -> None:
    registry = tmp_path / "registry.yaml"
    registry.write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "vaults": {"acme-work": {"path": str(FIXTURES / "shared-explicit")}},
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    with pytest.raises(ResolutionError, match="refusing to replace"):
        register_vault("acme-work", FIXTURES / "single-proactive", registry_path=registry, apply=True)

    assert yaml.safe_load(registry.read_text(encoding="utf-8"))["vaults"]["acme-work"]["path"] == str(
        FIXTURES / "shared-explicit"
    )


def test_registration_is_idempotent_for_the_same_id_and_path(tmp_path: Path) -> None:
    registry = tmp_path / "registry.yaml"
    register_vault("acme-work", FIXTURES / "single-proactive", registry_path=registry, apply=True)
    original = registry.read_bytes()

    register_vault("acme-work", FIXTURES / "single-proactive", registry_path=registry, apply=True)

    assert registry.read_bytes() == original


def test_atomic_registration_failure_preserves_the_registry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry = tmp_path / "registry.yaml"
    original = yaml.safe_dump(
        {
            "schema_version": 1,
            "vaults": {"shared-home": {"path": str(FIXTURES / "shared-explicit")}},
        },
        sort_keys=False,
    )
    registry.write_text(original, encoding="utf-8")

    def fail_replace(source: Path, destination: Path) -> None:
        raise OSError("simulated replace failure")

    monkeypatch.setattr(registry_module.os, "replace", fail_replace)

    with pytest.raises(OSError, match="simulated replace failure"):
        register_vault("acme-work", FIXTURES / "single-proactive", registry_path=registry, apply=True)

    assert registry.read_text(encoding="utf-8") == original
    assert list(tmp_path.glob(".registry.yaml.*.tmp")) == []
