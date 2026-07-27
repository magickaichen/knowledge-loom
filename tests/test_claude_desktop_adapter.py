from __future__ import annotations

import importlib.util
import zipfile
from pathlib import Path

import yaml

from knowledge_loom.contract import split_frontmatter

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
ADAPTER_ROOT = PACKAGE_ROOT / "adapters" / "claude-desktop" / "knowledge-loom"
SPEC = importlib.util.spec_from_file_location(
    "knowledge_loom_desktop_builder",
    PACKAGE_ROOT / "scripts" / "build_claude_desktop_skill.py",
)
assert SPEC and SPEC.loader
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def test_desktop_skill_metadata_and_capability_boundary() -> None:
    metadata, body = split_frontmatter(
        (ADAPTER_ROOT / "SKILL.md").read_text(encoding="utf-8"),
        source="Desktop SKILL.md",
    )

    assert metadata["name"] == ADAPTER_ROOT.name
    assert len(metadata["description"]) <= 200
    assert "Cowork" in metadata["description"]
    assert "regular Chat" in body
    assert "Do not modify the vault" in body
    assert "/Users/" not in body


def test_desktop_archive_has_one_root_and_bundled_references(tmp_path: Path) -> None:
    output = BUILDER.build_archive(tmp_path / "knowledge-loom.zip")

    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        assert names == [
            "knowledge-loom/SKILL.md",
            "knowledge-loom/references/protocol.md",
            "knowledge-loom/references/contract-schema.md",
        ]
        metadata, _ = split_frontmatter(
            archive.read("knowledge-loom/SKILL.md").decode(),
            source="zipped Desktop SKILL.md",
        )
        assert yaml.safe_dump(metadata)
