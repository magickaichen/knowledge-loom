from copy import deepcopy
from pathlib import Path

import pytest

from knowledge_loom.contract import ContractError, load_vault, render_contract, validate_contract_data

FIXTURES = Path(__file__).parent / "fixtures"


def test_fixture_contracts_are_valid() -> None:
    for name in ("single-proactive", "shared-explicit"):
        vault = load_vault(FIXTURES / name)
        assert validate_contract_data(vault.contract) == []


def test_shared_fixture_has_no_default_subject() -> None:
    vault = load_vault(FIXTURES / "shared-explicit")
    assert vault.contract["subjects"]["mode"] == "multiple"
    assert "default" not in vault.contract["subjects"]


def test_write_and_current_state_policies_are_independent() -> None:
    vault = load_vault(FIXTURES / "single-proactive")
    assert vault.contract["write"]["policy"] == "proactive-durable-capture"
    assert vault.contract["write"]["current_state_policy"] == "maintain-after-material-change"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("instruction", "/etc/hosts"),
        ("navigation", "../INDEX.md"),
        ("metadata", "Projects/../../outside/*.md"),
        ("focus", r"C:\\outside\\focus.md"),
        ("privacy", "../Local-Only/**"),
    ],
)
def test_contract_paths_must_be_vault_relative(field: str, value: str) -> None:
    contract = deepcopy(load_vault(FIXTURES / "single-proactive").contract)
    if field == "instruction":
        contract["instruction_roots"] = [value]
    elif field == "navigation":
        contract["navigation"]["entrypoints"] = [value]
    elif field == "metadata":
        contract["metadata_profiles"]["project-note"]["paths"] = [value]
    elif field == "focus":
        contract["focus_views"]["work"]["path"] = value
    else:
        contract["privacy"]["never_track"] = [value]

    findings = validate_contract_data(contract)
    assert any(finding.code == "contract.path-boundary" and finding.path == value for finding in findings)


def test_contract_file_cannot_be_a_symlink_outside_the_vault(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    source = load_vault(FIXTURES / "single-proactive")
    outside = tmp_path / "outside-contract.md"
    outside.write_text(render_contract(source.contract, source.body), encoding="utf-8")
    (root / "KNOWLEDGE_VAULT.md").symlink_to(outside)

    with pytest.raises(ContractError, match="outside the vault root"):
        load_vault(root)
