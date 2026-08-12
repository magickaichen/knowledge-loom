from __future__ import annotations

import json
import tomllib
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/magickaichen/knowledge-loom"
PLUGIN_NAME = "knowledge-loom"


def load_json(relative: str) -> dict[str, object]:
    return json.loads((PACKAGE_ROOT / relative).read_text(encoding="utf-8"))


def test_license_and_package_metadata_match() -> None:
    project = tomllib.loads((PACKAGE_ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    license_text = (PACKAGE_ROOT / "LICENSE").read_text(encoding="utf-8")
    codex_manifest = load_json(".codex-plugin/plugin.json")
    claude_manifest = load_json(".claude-plugin/plugin.json")

    assert project["license"] == codex_manifest["license"] == claude_manifest["license"] == "MIT"
    assert project["version"] == codex_manifest["version"] == claude_manifest["version"]
    assert project["urls"]["Repository"] == codex_manifest["repository"] == claude_manifest["repository"]
    assert license_text.startswith("MIT License\n\nCopyright (c) 2026 Mike Xiao\n")


def test_codex_marketplace_points_to_the_root_plugin() -> None:
    manifest = load_json(".codex-plugin/plugin.json")
    marketplace = load_json(".agents/plugins/marketplace.json")
    entries = marketplace["plugins"]

    assert marketplace["name"] == PLUGIN_NAME
    assert marketplace["interface"] == {"displayName": "Knowledge Loom"}
    assert isinstance(entries, list) and len(entries) == 1
    entry = entries[0]
    assert entry["name"] == manifest["name"] == PLUGIN_NAME
    assert entry["source"] == {"source": "url", "url": REPOSITORY, "ref": "main"}
    assert entry["policy"] == {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}
    assert entry["category"] == "Productivity"


def test_claude_marketplace_points_to_the_root_plugin() -> None:
    manifest = load_json(".claude-plugin/plugin.json")
    marketplace = load_json(".claude-plugin/marketplace.json")
    entries = marketplace["plugins"]

    assert marketplace["name"] == PLUGIN_NAME
    assert isinstance(entries, list) and len(entries) == 1
    entry = entries[0]
    assert entry["name"] == manifest["name"] == PLUGIN_NAME
    assert entry["source"] == "./"
    assert entry["version"] == manifest["version"]
    assert entry["repository"] == manifest["repository"] == REPOSITORY
    assert entry["license"] == manifest["license"] == "MIT"


def test_readme_leads_with_the_user_outcome_and_names_supported_install_paths() -> None:
    readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

    assert "use local Markdown notes without guessing which folder" in readme
    assert readme.index("## Install") < readme.index("## How it works")
    assert readme.index("## Try it") < readme.index("## How it works")
    assert "npx skills add" in readme
    assert "codex plugin marketplace add" in readme
    assert "claude plugin marketplace add" in readme
    assert "Claude Desktop custom skills use a ZIP upload" in readme
