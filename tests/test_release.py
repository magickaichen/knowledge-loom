from __future__ import annotations

import subprocess
import sys
import tomllib
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def package_version() -> str:
    project = tomllib.loads((PACKAGE_ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    return project["version"]


def run_checker(tag: str, *extra_arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/check_release_version.py", tag, *extra_arguments],
        cwd=PACKAGE_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_release_version_checker_accepts_the_package_version() -> None:
    version = package_version()
    result = run_checker(f"v{version}")

    assert result.returncode == 0
    assert f"PASS release tag v{version}" in result.stdout


def test_release_version_checker_rejects_a_mismatched_tag() -> None:
    result = run_checker("v999.0.0")

    assert result.returncode != 0
    assert "does not match package version" in result.stderr


def test_release_version_checker_writes_curated_changelog_notes(tmp_path: Path) -> None:
    version = package_version()
    notes = tmp_path / "release-notes.md"

    result = run_checker(f"v{version}", "--notes-output", str(notes))

    assert result.returncode == 0
    assert notes.read_text(encoding="utf-8").startswith("Initial public release.")
    assert "Full Changelog" not in notes.read_text(encoding="utf-8")


def test_release_workflow_validates_and_publishes_the_desktop_zip() -> None:
    workflow = (PACKAGE_ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")

    assert 'tags:\n      - "v*"' in workflow
    assert 'scripts/check_release_version.py "$GITHUB_REF_NAME"' in workflow
    assert "uv run python scripts/validate.py" in workflow
    assert "knowledge-loom-claude-desktop-${GITHUB_REF_NAME}.zip" in workflow
    assert "gh release create" in workflow
    assert "--verify-tag" in workflow
    assert '--notes-output "dist/release-notes.md"' in workflow
    assert "--notes-file dist/release-notes.md" in workflow
    assert '--title "$GITHUB_REF_NAME"' in workflow
    assert "--generate-notes" not in workflow
