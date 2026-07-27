#!/usr/bin/env python3
"""Preview or install the shared skill source into an agent-neutral skills directory."""

from __future__ import annotations

import argparse
from pathlib import Path

SKILLS = (
    "use-knowledge-vault",
    "init-knowledge-vault",
    "audit-knowledge-vault",
    "manage-current-focus",
)


def install(package_root: Path, target_root: Path, *, apply: bool) -> int:
    package_root = package_root.resolve()
    target_root = target_root.expanduser().resolve()
    actions: list[tuple[Path, Path]] = []

    for name in SKILLS:
        source = package_root / "skills" / name
        target = target_root / name
        if not (source / "SKILL.md").is_file():
            raise FileNotFoundError(f"missing skill source: {source}")
        if target.is_symlink() and target.resolve() == source:
            print(f"OK      {target} -> {source}")
            continue
        if target.exists() or target.is_symlink():
            raise FileExistsError(f"refusing to replace existing install: {target}")
        actions.append((source, target))

    for source, target in actions:
        if apply:
            target_root.mkdir(parents=True, exist_ok=True)
            target.symlink_to(source, target_is_directory=True)
            print(f"LINKED  {target} -> {source}")
        else:
            print(f"DRY RUN link {target} -> {source}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--target",
        type=Path,
        default=Path.home() / ".agents" / "skills",
        help="shared skills directory discovered by supported runtimes",
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    return install(Path(__file__).resolve().parents[1], args.target, apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
