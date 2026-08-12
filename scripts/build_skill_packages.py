#!/usr/bin/env python3
"""Build or verify the self-contained files shipped inside each agent skill."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SKILL_REFERENCES = {
    "use-knowledge-vault": ("protocol.md",),
    "init-knowledge-vault": ("protocol.md", "contract-schema.md"),
    "audit-knowledge-vault": ("protocol.md", "contract-schema.md"),
    "manage-current-focus": ("protocol.md",),
}

RUNNER = """#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["PyYAML==6.0.3"]
# ///
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from knowledge_loom.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
"""


def expected_files(package_root: Path, skill_name: str) -> dict[Path, bytes]:
    expected = {
        Path("references") / name: (package_root / "references" / name).read_bytes()
        for name in SKILL_REFERENCES[skill_name]
    }
    expected[Path("scripts") / "knowledge-loom.py"] = RUNNER.encode()
    source_root = package_root / "src"
    for source in sorted((source_root / "knowledge_loom").glob("*.py")):
        expected[Path("scripts") / source.relative_to(source_root)] = source.read_bytes()
    return expected


def managed_files(skill_root: Path) -> set[Path]:
    files: set[Path] = set()
    for directory in ("references", "scripts"):
        root = skill_root / directory
        if root.exists():
            files.update(path.relative_to(skill_root) for path in root.rglob("*") if path.is_file())
    return files


def check_skill(package_root: Path, skill_name: str) -> list[str]:
    skill_root = package_root / "skills" / skill_name
    expected = expected_files(package_root, skill_name)
    errors: list[str] = []
    for relative, contents in expected.items():
        target = skill_root / relative
        if not target.is_file():
            errors.append(f"missing {target}")
        elif target.read_bytes() != contents:
            errors.append(f"stale {target}")
    for relative in sorted(managed_files(skill_root) - set(expected)):
        errors.append(f"unexpected {skill_root / relative}")
    return errors


def build_skill(package_root: Path, skill_name: str) -> None:
    skill_root = package_root / "skills" / skill_name
    for directory in ("references", "scripts"):
        target = skill_root / directory
        if target.exists():
            shutil.rmtree(target)
    for relative, contents in expected_files(package_root, skill_name).items():
        target = skill_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
        if relative == Path("scripts") / "knowledge-loom.py":
            target.chmod(0o755)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when generated packages are missing or stale")
    args = parser.parse_args()
    package_root = Path(__file__).resolve().parents[1]

    if args.check:
        errors = [
            error
            for skill_name in SKILL_REFERENCES
            for error in check_skill(package_root, skill_name)
        ]
        if errors:
            for error in errors:
                print(f"ERROR {error}")
            return 1
        print("PASS self-contained skill packages are current")
        return 0

    for skill_name in SKILL_REFERENCES:
        build_skill(package_root, skill_name)
        print(f"BUILT skills/{skill_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
