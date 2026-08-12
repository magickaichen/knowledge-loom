from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from knowledge_loom.contract import split_frontmatter

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "knowledge_loom_skill_builder",
    PACKAGE_ROOT / "scripts" / "build_skill_packages.py",
)
assert SPEC and SPEC.loader
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def test_generated_skill_packages_are_current() -> None:
    for skill_name in BUILDER.SKILL_REFERENCES:
        assert BUILDER.check_skill(PACKAGE_ROOT, skill_name) == []


@pytest.mark.parametrize("skill_name", BUILDER.SKILL_REFERENCES)
def test_each_copied_skill_runs_without_the_source_checkout(tmp_path: Path, skill_name: str) -> None:
    installed = tmp_path / "installed" / skill_name
    shutil.copytree(PACKAGE_ROOT / "skills" / skill_name, installed)
    completed = subprocess.run(
        [
            sys.executable,
            str(installed / "scripts" / "knowledge-loom.py"),
            "audit",
            str(PACKAGE_ROOT / "tests" / "fixtures" / "single-proactive"),
        ],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout == "PASS no findings\n"
    assert not list(installed.rglob("__pycache__"))


def test_runtime_bytecode_is_not_treated_as_package_drift(tmp_path: Path) -> None:
    skill_root = tmp_path / "skill"
    cache = skill_root / "scripts" / "knowledge_loom" / "__pycache__" / "audit.pyc"
    cache.parent.mkdir(parents=True)
    cache.write_bytes(b"runtime cache")

    assert BUILDER.managed_files(skill_root) == set()


def test_skill_frontmatter_and_plugin_manifests_match_the_distribution() -> None:
    skill_names = set(BUILDER.SKILL_REFERENCES)
    for skill_name in skill_names:
        metadata, _ = split_frontmatter(
            (PACKAGE_ROOT / "skills" / skill_name / "SKILL.md").read_text(encoding="utf-8"),
            source=skill_name,
        )
        assert metadata.keys() == {"name", "description"}
        assert metadata["name"] == skill_name
        assert metadata["description"].strip()

    codex_manifest = json.loads((PACKAGE_ROOT / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
    claude_manifest = json.loads((PACKAGE_ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    assert codex_manifest["name"] == claude_manifest["name"] == "knowledge-loom"
    assert (PACKAGE_ROOT / codex_manifest["skills"]).resolve() == (PACKAGE_ROOT / "skills").resolve()
