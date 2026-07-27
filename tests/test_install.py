from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "knowledge_loom_install",
    PACKAGE_ROOT / "scripts" / "install.py",
)
assert SPEC and SPEC.loader
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)


def test_installs_idempotent_links_into_both_runtime_directories(tmp_path: Path) -> None:
    targets = [tmp_path / "agents-skills", tmp_path / "claude-skills"]

    assert INSTALLER.install(PACKAGE_ROOT, targets, apply=True) == 0
    assert INSTALLER.install(PACKAGE_ROOT, targets, apply=True) == 0

    for target in targets:
        for name in INSTALLER.SKILLS:
            link = target / name
            assert link.is_symlink()
            assert link.resolve() == PACKAGE_ROOT / "skills" / name


def test_preflight_refuses_collision_before_creating_any_link(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    collision = second / INSTALLER.SKILLS[-1]
    collision.mkdir(parents=True)

    with pytest.raises(FileExistsError):
        INSTALLER.install(PACKAGE_ROOT, [first, second], apply=True)

    assert not first.exists()
