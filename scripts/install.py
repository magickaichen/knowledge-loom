#!/usr/bin/env python3
"""Preview or install Knowledge Loom skills into supported local runtime directories."""

from __future__ import annotations

import argparse
from pathlib import Path

SKILLS = (
    "use-knowledge-vault",
    "init-knowledge-vault",
    "audit-knowledge-vault",
    "manage-current-focus",
)

DEFAULT_TARGETS = (
    Path.home() / ".agents" / "skills",
    Path.home() / ".claude" / "skills",
)


def install(package_root: Path, target_roots: list[Path] | tuple[Path, ...], *, apply: bool) -> int:
    package_root = package_root.resolve()
    resolved_targets = [target.expanduser().resolve() for target in target_roots]
    unchanged: list[tuple[Path, Path]] = []
    actions: list[tuple[Path, Path]] = []

    for target_root in resolved_targets:
        for name in SKILLS:
            source = package_root / "skills" / name
            target = target_root / name
            if not (source / "SKILL.md").is_file():
                raise FileNotFoundError(f"missing skill source: {source}")
            if target.is_symlink() and target.resolve() == source:
                unchanged.append((source, target))
                continue
            if target.exists() or target.is_symlink():
                raise FileExistsError(f"refusing to replace existing install: {target}")
            actions.append((source, target))

    for source, target in unchanged:
        print(f"OK      {target} -> {source}")
    for source, target in actions:
        if apply:
            target.parent.mkdir(parents=True, exist_ok=True)
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
        action="append",
        dest="targets",
        help=(
            "skills directory to install into; repeat to select multiple targets "
            "(default: ~/.agents/skills and ~/.claude/skills)"
        ),
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    return install(
        Path(__file__).resolve().parents[1],
        args.targets or list(DEFAULT_TARGETS),
        apply=args.apply,
    )


if __name__ == "__main__":
    raise SystemExit(main())
