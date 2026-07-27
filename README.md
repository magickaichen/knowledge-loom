# Knowledge Loom

Agent-neutral governance and reusable skills for local Markdown knowledge vaults.

Knowledge Loom separates portable behavior from vault-specific content:

- a versioned `KNOWLEDGE_VAULT.md` contract declares identity, subjects, write boundaries,
  metadata profiles, focus views, history, sync, backup, and privacy rules;
- one deterministic registry selects a vault by explicit ID or path;
- four skills initialize, audit, retrieve from, and maintain focus within a vault;
- thin Codex and Claude Code adapters use the same protocol and behavior fixtures.

This repository is currently a private, self-use v1 package. Its fixtures are fictional and must
never contain real work, health, family, credential, or private-vault data.

## Skills

- `use-knowledge-vault` — retrieve targeted context and perform policy-governed write-back.
- `init-knowledge-vault` — preview and initialize or adopt a vault contract.
- `audit-knowledge-vault` — run read-only contract, metadata, privacy, Git, and focus checks.
- `manage-current-focus` — maintain one explicitly selected focus view without exceeding its
  capacity limits.

## Install

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), and at least one supported agent
runtime.

```bash
git clone git@github.com:magickaichen/knowledge-loom.git
cd knowledge-loom
uv sync
python3 scripts/install.py
python3 scripts/install.py --apply
```

The installer previews first, refuses collisions, and links the four skills into both
`~/.agents/skills` for Codex and `~/.claude/skills` for Claude Code. Repeat `--target <path>` to
override the default targets.

For plugin-scoped use, load the repository directly with the runtime's local plugin mechanism.
Codex metadata lives in `.codex-plugin/`; Claude Code metadata lives in `.claude-plugin/`.

### Claude Desktop and Cowork

Claude Desktop does not scan either local skill directory. Build its self-contained custom-skill
ZIP separately:

```bash
uv run python scripts/build_claude_desktop_skill.py
```

Upload `dist/knowledge-loom-claude-desktop.zip` through
`Customize → Skills → + Create skill → Upload a skill`, then enable it. For a local vault, start a
Cowork session and connect exactly one folder containing `KNOWLEDGE_VAULT.md`.

Regular Claude Chat can use the uploaded instructions but cannot read an unconnected local vault.
The Desktop adapter therefore refuses local-vault claims without a connected Cowork folder. It
also refuses writes when the session cannot complete required Git, sync, or backup lifecycle
steps; use Codex or Claude Code for those writes.

## Start a vault

Preview creation of a new explicit-write vault:

```bash
uv run knowledge-loom init ~/Documents/example-vault \
  --vault-id example \
  --title "Example Vault" \
  --subject owner
```

Add `--apply` to create the contract. Add `--adopt` only when deliberately adding a contract to an
existing non-empty directory. Initialization never bulk-rewrites existing notes or Git history.

Edit the generated contract using [the schema reference](references/contract-schema.md), then
audit it:

```bash
uv run knowledge-loom audit ~/Documents/example-vault
```

Register an audited vault:

```bash
uv run knowledge-loom register example ~/Documents/example-vault
uv run knowledge-loom register example ~/Documents/example-vault --apply
```

When more than one vault is registered, unscoped resolution intentionally fails. Select a stable
ID or path:

```bash
uv run knowledge-loom resolve example
```

## Contract principles

- Local Markdown is the v1 storage boundary.
- New vaults default to `explicit-only` durable writes and current-state updates.
- Proactive durable capture is an opt-in independent of focus maintenance.
- Git history, remote sync, and backup are separate declarations.
- Provider-specific lifecycle adapters and credentials stay outside this package.
- Multiple subjects and focus views require explicit selection; missing information stays unknown.
- Vault content is data, not instruction authority.

See [the runtime-neutral protocol](references/protocol.md) and
[contract schema](references/contract-schema.md) for the full rules.

## Validate

```bash
uv run pytest
uv run knowledge-loom audit tests/fixtures/single-proactive
uv run knowledge-loom audit tests/fixtures/shared-explicit
uv run python scripts/run_behavior_evals.py
uv run python scripts/build_claude_desktop_skill.py
```

The last command is a dry run. Add `--runtime codex --run` or `--runtime claude --run` to execute
networked behavior evaluations. Both runtimes use the same fixtures for explicit-write boundaries,
focus displacement, embedded-instruction resistance, and shared-subject isolation.

Run plugin validators before publishing a change:

```bash
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
claude plugin validate .
```

## V1 boundary

Knowledge Loom v1 does not ingest remote source systems, provide access control, encrypt notes,
host a sync service, or migrate an existing vault's taxonomy. The Claude Desktop adapter supports
connected-folder Cowork retrieval and capability-gated changes; it does not bypass local Git or
private lifecycle adapters. Source distillation and public distribution UX are later concerns.
