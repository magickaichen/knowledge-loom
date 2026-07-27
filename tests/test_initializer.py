from pathlib import Path

from knowledge_loom.contract import load_vault
from knowledge_loom.initializer import build_contract, initialize_vault


def test_new_vault_defaults_to_explicit_only(tmp_path: Path) -> None:
    root = tmp_path / "new-vault"
    contract = build_contract(
        root,
        vault_id="new-vault",
        title="New Vault",
        subjects=["owner"],
        write_policy="explicit-only",
        current_state_policy="explicit-only",
        history_type="none",
        adopt=False,
    )
    contract_path, _ = initialize_vault(root, contract=contract, adopt=False, apply=False)
    assert not contract_path.exists()

    initialize_vault(root, contract=contract, adopt=False, apply=True)
    vault = load_vault(root)
    assert vault.contract["write"]["policy"] == "explicit-only"
    assert (root / "INDEX.md").is_file()


def test_adoption_does_not_rewrite_existing_content(tmp_path: Path) -> None:
    root = tmp_path / "existing"
    root.mkdir()
    note = root / "legacy.md"
    note.write_text("legacy content\n", encoding="utf-8")
    contract = build_contract(
        root,
        vault_id="existing",
        title="Existing",
        subjects=["owner"],
        write_policy="explicit-only",
        current_state_policy="explicit-only",
        history_type="none",
        adopt=True,
    )
    initialize_vault(root, contract=contract, adopt=True, apply=True)
    assert note.read_text(encoding="utf-8") == "legacy content\n"
