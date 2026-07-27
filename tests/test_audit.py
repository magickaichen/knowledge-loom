from pathlib import Path

from knowledge_loom.audit import audit_vault, matches_path
from knowledge_loom.contract import load_vault

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
