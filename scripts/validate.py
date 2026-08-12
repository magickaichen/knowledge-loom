#!/usr/bin/env python3
"""Run the repository's authoritative validation sequence."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(package_root: Path, *arguments: str) -> None:
    subprocess.run([sys.executable, *arguments], cwd=package_root, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--npx", action="store_true", help="include the networked npx-skills installation test")
    args = parser.parse_args()
    package_root = Path(__file__).resolve().parents[1]

    run(package_root, "scripts/build_skill_packages.py", "--check")
    run(package_root, "-m", "pytest")
    for fixture in ("single-proactive", "shared-explicit"):
        run(package_root, "-m", "knowledge_loom.cli", "audit", f"tests/fixtures/{fixture}")
    run(package_root, "scripts/run_behavior_evals.py")
    run(package_root, "scripts/build_claude_desktop_skill.py")
    if args.npx:
        run(package_root, "scripts/test_npx_install.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
