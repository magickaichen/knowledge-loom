# Contributing

Keep Knowledge Loom agent-neutral and keep every fixture fictional. Open an issue before changing
the contract schema or protocol semantics so compatibility and migration behavior are explicit.

## Development

Install Python 3.11+ and [uv](https://docs.astral.sh/uv/), then run:

```bash
uv sync
uv run python scripts/build_skill_packages.py
uv run python scripts/build_skill_packages.py --check
uv run pytest
uv run knowledge-loom audit tests/fixtures/single-proactive
uv run knowledge-loom audit tests/fixtures/shared-explicit
uv run python scripts/run_behavior_evals.py
uv run python scripts/build_claude_desktop_skill.py
```

Edit the top-level protocol, schema, and Python package rather than their generated copies inside
`skills/*/references` and `skills/*/scripts`. Include tests for behavioral or safety changes. Never
place credentials or real personal, company, health, family, or private-vault content in issues,
fixtures, logs, or pull requests.
