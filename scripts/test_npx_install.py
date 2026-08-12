#!/usr/bin/env python3
"""Verify real npx-skills discovery and a self-contained copy installation."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

SKILLS_CLI = os.environ.get("KNOWLEDGE_LOOM_SKILLS_CLI", "skills@1.5.22")
SKILL_NAMES = (
    "audit-knowledge-vault",
    "init-knowledge-vault",
    "manage-current-focus",
    "use-knowledge-vault",
)
RUNNER_CHECK_ROOTS = (
    Path(".agents/skills"),
    Path(".claude/skills"),
)


def run(command: list[str], *, cwd: Path, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
    environment = {**os.environ, "DISABLE_TELEMETRY": "1"}
    return subprocess.run(
        command,
        cwd=cwd,
        env=environment,
        text=True,
        capture_output=capture_output,
        check=True,
    )


def main() -> int:
    package_root = Path(__file__).resolve().parents[1]
    npx = shutil.which("npx")
    uv = shutil.which("uv")
    if npx is None or uv is None:
        missing = ", ".join(name for name, path in (("npx", npx), ("uv", uv)) if path is None)
        raise SystemExit(f"missing required command(s): {missing}")

    with tempfile.TemporaryDirectory(prefix="knowledge-loom-npx-") as temporary:
        workspace = Path(temporary)
        listing = run(
            [npx, "--yes", SKILLS_CLI, "add", str(package_root), "--list"],
            cwd=workspace,
            capture_output=True,
        ).stdout
        for skill_name in SKILL_NAMES:
            if skill_name not in listing:
                raise SystemExit(f"npx discovery omitted {skill_name}")

        run(
            [
                npx,
                "--yes",
                SKILLS_CLI,
                "add",
                str(package_root),
                "--skill",
                "*",
                "--agent",
                "*",
                "--copy",
                "--yes",
            ],
            cwd=workspace,
        )

        installed_roots: dict[Path, set[str]] = {}
        for skill_file in workspace.rglob("SKILL.md"):
            if skill_file.parent.name in SKILL_NAMES:
                installed_roots.setdefault(skill_file.parent.parent, set()).add(
                    skill_file.parent.name
                )
        if len(installed_roots) <= len(RUNNER_CHECK_ROOTS):
            raise SystemExit(
                "npx all-agent installation did not create additional agent install roots"
            )
        for installed_root, skill_names in installed_roots.items():
            if skill_names != set(SKILL_NAMES):
                raise SystemExit(
                    f"incomplete all-agent installation at {installed_root}: {sorted(skill_names)}"
                )

        for relative_root in RUNNER_CHECK_ROOTS:
            installed_root = workspace / relative_root
            for skill_name in SKILL_NAMES:
                runner = installed_root / skill_name / "scripts" / "knowledge-loom.py"
                run(
                    [
                        uv,
                        "run",
                        str(runner),
                        "audit",
                        str(package_root / "tests" / "fixtures" / "single-proactive"),
                    ],
                    cwd=workspace,
                )

        installed = json.loads(
            run(
                [npx, "--yes", SKILLS_CLI, "list", "--json"],
                cwd=workspace,
                capture_output=True,
            ).stdout
        )
        names = {record["name"] for record in installed}
        if names != set(SKILL_NAMES):
            raise SystemExit(f"installed skill mismatch: {sorted(names)}")

    print(
        f"PASS npx {SKILLS_CLI} installed all four skills for every supported agent "
        f"across {len(installed_roots)} distinct roots; Codex and Claude Code runners passed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
