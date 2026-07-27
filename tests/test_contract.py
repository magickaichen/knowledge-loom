from pathlib import Path

from knowledge_loom.contract import load_vault, validate_contract_data

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
