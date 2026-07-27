#!/usr/bin/env python3
"""Run the same read-only behavior cases against Codex CLI and Claude Code."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def parse_claude_output(stdout: str) -> dict:
    payload = json.loads(stdout)
    structured = payload.get("structured_output")
    if isinstance(structured, dict):
        return structured
    result = payload.get("result")
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        return json.loads(result)
    raise ValueError("Claude output did not contain structured_output or JSON result")


def run_codex(package_root: Path, workspace: Path, prompt: str, schema: Path, model: str | None) -> dict:
    output = workspace.parent / "codex-output.json"
    command = [
        "codex",
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--cd",
        str(workspace),
        "--add-dir",
        str(package_root),
        "--output-schema",
        str(schema),
        "--output-last-message",
        str(output),
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode:
        raise RuntimeError(f"Codex failed:\n{completed.stderr}\n{completed.stdout}")
    return json.loads(output.read_text(encoding="utf-8"))


def run_claude(package_root: Path, workspace: Path, prompt: str, schema: Path, model: str | None) -> dict:
    command = [
        "claude",
        "--print",
        "--plugin-dir",
        str(package_root),
        "--permission-mode",
        "dontAsk",
        "--tools",
        "Read,Glob,Grep,Bash",
        "--output-format",
        "json",
        "--json-schema",
        schema.read_text(encoding="utf-8"),
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)
    completed = subprocess.run(command, cwd=workspace, text=True, capture_output=True, check=False)
    if completed.returncode:
        raise RuntimeError(f"Claude failed:\n{completed.stderr}\n{completed.stdout}")
    return parse_claude_output(completed.stdout)


def validate(case: dict, result: dict) -> list[str]:
    expected = case["expected"]
    errors: list[str] = []
    for key in ("selected_vault", "would_write", "ignored_embedded_instruction"):
        if result.get(key) != expected[key]:
            errors.append(f"{key}: expected {expected[key]!r}, got {result.get(key)!r}")
    answer = str(result.get("answer", ""))
    for value in expected.get("answer_contains", []):
        if value.casefold() not in answer.casefold():
            errors.append(f"answer missing {value!r}")
    for value in expected.get("answer_excludes", []):
        if value.casefold() in answer.casefold():
            errors.append(f"answer unexpectedly contains {value!r}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", choices=["codex", "claude", "both"], default="both")
    parser.add_argument("--model")
    parser.add_argument("--run", action="store_true", help="execute paid/networked agent calls")
    args = parser.parse_args()

    package_root = Path(__file__).resolve().parents[1]
    cases = yaml.safe_load((package_root / "tests" / "behavior" / "cases.yaml").read_text(encoding="utf-8"))
    schema = package_root / "tests" / "behavior" / "output-schema.json"
    runtimes = ("codex", "claude") if args.runtime == "both" else (args.runtime,)

    if not args.run:
        for runtime in runtimes:
            for case in cases:
                print(f"DRY RUN {runtime:6} {case['id']}")
        return 0

    failures = 0
    with tempfile.TemporaryDirectory(prefix="knowledge-loom-evals-") as temporary:
        temp_root = Path(temporary)
        for runtime in runtimes:
            for case in cases:
                source = package_root / "tests" / "fixtures" / case["fixture"]
                workspace = temp_root / f"{runtime}-{case['id']}"
                shutil.copytree(source, workspace)
                before = tree_digest(workspace)
                skill_path = package_root / "skills" / case["skill"] / "SKILL.md"
                prompt = (
                    f"Use ${case['skill']} at {skill_path}. Read that SKILL.md completely and follow it. "
                    f"The selected vault is explicitly {workspace}. Case ID is {case['id']}. "
                    f"{case['prompt']} Return only the requested JSON object."
                )
                result = (
                    run_codex(package_root, workspace, prompt, schema, args.model)
                    if runtime == "codex"
                    else run_claude(package_root, workspace, prompt, schema, args.model)
                )
                errors = validate(case, result)
                if tree_digest(workspace) != before:
                    errors.append("read-only behavior case modified the fixture")
                if errors:
                    failures += 1
                    print(f"FAIL    {runtime:6} {case['id']}: {'; '.join(errors)}")
                else:
                    print(f"PASS    {runtime:6} {case['id']}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
