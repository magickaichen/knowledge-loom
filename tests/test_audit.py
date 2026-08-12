import shutil
from copy import deepcopy
from pathlib import Path

import pytest

from knowledge_loom.audit import audit_vault, matches_path
from knowledge_loom.contract import load_vault, render_contract
from knowledge_loom.models import Vault

FIXTURES = Path(__file__).parent / "fixtures"


def test_clean_fixtures_have_no_errors() -> None:
    for name in ("single-proactive", "shared-explicit"):
        findings = audit_vault(load_vault(FIXTURES / name))
        assert findings == []


def test_metadata_gap_is_reported(tmp_path: Path) -> None:
    root = tmp_path / "shared"
    root.mkdir()
    source = FIXTURES / "shared-explicit"
    for path in source.rglob("*"):
        if path.is_file():
            target = root / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    health = root / "Health" / "sam.md"
    health.write_text("# Sam health\n", encoding="utf-8")

    findings = audit_vault(load_vault(root))
    assert any(finding.code == "metadata.missing" and finding.path == "Health/sam.md" for finding in findings)


def test_focus_limit_is_reported(tmp_path: Path) -> None:
    root = tmp_path / "single"
    root.mkdir()
    source = FIXTURES / "single-proactive"
    for path in source.rglob("*"):
        if path.is_file():
            target = root / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    focus = root / "Projects" / "current-focus.md"
    original = focus.read_text(encoding="utf-8")
    focus.write_text(
        original.replace(
            "\n## Waiting\n",
            "\n### 3. Hidden parallel task\n\n- **Next action:** Start another stream.\n\n## Waiting\n",
        ),
        encoding="utf-8",
    )

    findings = audit_vault(load_vault(root))
    assert any(finding.code == "focus.max-top" for finding in findings)
    assert any(finding.code == "focus.max-active" for finding in findings)


def test_double_star_patterns_match_zero_or_more_directories() -> None:
    assert matches_path("Health/**/*.md", "Health/alex.md")
    assert matches_path("Health/**/*.md", "Health/history/alex.md")
    assert not matches_path("Health/**/*.md", "People/alex.md")


@pytest.mark.parametrize(
    ("relative", "finding_code"),
    [
        ("AGENTS.md", "path.instruction-boundary"),
        ("INDEX.md", "path.navigation-boundary"),
        ("Projects/current-focus.md", "focus.boundary"),
        ("Projects/parser-project.md", "path.metadata-boundary"),
    ],
)
def test_audit_rejects_symlink_escape_from_contract_paths(
    tmp_path: Path,
    relative: str,
    finding_code: str,
) -> None:
    root = tmp_path / "vault"
    shutil.copytree(FIXTURES / "single-proactive", root)
    target = root / relative
    target.unlink()
    outside = tmp_path / target.name
    outside.write_text("---\nstatus: current\n---\n\n# Outside\n", encoding="utf-8")
    target.symlink_to(outside)

    findings = audit_vault(load_vault(root))
    assert any(finding.code == finding_code and finding.path == relative for finding in findings)


@pytest.mark.parametrize(
    "field",
    ["subjects", "navigation", "metadata_profiles", "history", "privacy", "focus_views"],
)
def test_malformed_contract_sections_report_errors_instead_of_crashing(field: str) -> None:
    source = load_vault(FIXTURES / "single-proactive")
    contract = deepcopy(source.contract)
    contract[field] = []
    vault = Vault(source.root, source.contract_path, contract, source.body)

    findings = audit_vault(vault)

    assert any(finding.severity == "error" for finding in findings)


def test_privacy_pattern_rejects_a_symlinked_prefix_outside_the_vault(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    shutil.copytree(FIXTURES / "single-proactive", root)
    outside = tmp_path / "outside"
    outside.mkdir()
    (root / "External").symlink_to(outside, target_is_directory=True)
    vault = load_vault(root)
    contract = deepcopy(vault.contract)
    contract["privacy"]["never_track"] = ["External/**"]
    vault.contract_path.write_text(render_contract(contract, vault.body), encoding="utf-8")

    findings = audit_vault(load_vault(root))

    assert any(
        finding.code == "path.privacy-boundary" and finding.path == "External/**"
        for finding in findings
    )
