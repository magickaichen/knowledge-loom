# Contributing

Keep Knowledge Loom agent-neutral and keep every fixture fictional. Open an issue before changing
the contract schema or protocol semantics so compatibility and migration behavior are explicit.

## Development

Install Python 3.11+ and [uv](https://docs.astral.sh/uv/), then run:

```bash
uv sync
uv run python scripts/build_skill_packages.py
uv run python scripts/validate.py --npx
```

Edit the top-level protocol, schema, and Python package rather than their generated copies inside
`skills/*/references` and `skills/*/scripts`. Include tests for behavioral or safety changes. Never
place credentials or real personal, company, health, family, or private-vault content in issues,
fixtures, logs, or pull requests.

## Distribution metadata

Keep the plugin at the repository root so Codex, Claude Code, and `npx skills` all package the same
`skills/` directory. The Codex marketplace therefore uses the remote `source: "url"` form for a
repository-root plugin, as documented in OpenAI's
[marketplace metadata](https://developers.openai.com/plugins/build/plugins#marketplace-metadata)
reference. The `plugin-creator` scaffold's `./plugins/<name>` local path applies when a marketplace
contains nested plugin directories; do not introduce that duplicate layout here.

Keep the Python package, both plugin manifests, and the Claude marketplace on the same version,
repository URL, and license. `tests/test_distribution.py` enforces those required copies.

## Release

1. Update the version in `pyproject.toml`, both plugin manifests, and the Claude marketplace.
2. Run `uv run python scripts/validate.py --npx` and merge the change into `main`.
3. Create and push an annotated tag that matches the package version:

   ```bash
   git tag -a v0.1.1 -m "Knowledge Loom v0.1.1"
   git push origin v0.1.1
   ```

The release workflow rejects a mismatched tag, runs the local validation suite, builds a versioned
Claude Desktop ZIP, and publishes the GitHub Release with generated notes.
