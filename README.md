# Knowledge Loom

Knowledge Loom lets Codex and Claude use local Markdown notes without guessing which folder to
open, mixing one person's facts with another's, or writing behind your back.

A **vault** is any folder of Markdown files, including an Obsidian vault. Knowledge Loom adds a
small rules file to that folder and gives your agent four skills:

- `init-knowledge-vault` sets up or adopts a vault, with a preview before it writes anything.
- `audit-knowledge-vault` checks the contract, metadata, privacy rules, Git state, and focus views.
- `use-knowledge-vault` finds the smallest useful set of notes and handles approved updates.
- `manage-current-focus` keeps a short list of what matters now.

## Install

Every install method needs Python 3.11+ and [uv](https://docs.astral.sh/uv/). The `npx` option also
needs Node.js.

### Recommended: Codex and Claude Code together

Copy one command to install all four skills for both agents:

```bash
npx skills add magickaichen/knowledge-loom --skill '*' --global --agent codex claude-code --copy --yes
```

This is the shortest path if you only need the skills. Each installed skill carries its own
protocol and runner, so it keeps working without the original repository checkout.

### Codex plugin

Register the repository marketplace and install the plugin:

```bash
codex plugin marketplace add magickaichen/knowledge-loom && codex plugin add knowledge-loom@knowledge-loom
```

Start a new Codex task after installation so the four skills are available.

### Claude Code plugin

Register the repository marketplace and install the plugin:

```bash
claude plugin marketplace add magickaichen/knowledge-loom && claude plugin install knowledge-loom@knowledge-loom
```

Run `/reload-plugins` in an existing Claude Code session, or start a new one.

Private repositories work when Git, GitHub CLI, or SSH credentials can read them. A public
repository can be installed without GitHub authentication.

## Try it

Open your Markdown folder in Codex or Claude Code and ask:

> Initialize this folder as a knowledge vault. Show me the preview and do not write anything yet.

Review the proposed contract, then approve it when the vault ID, subject, write policy, and files
look right. Next, try:

> Audit this knowledge vault without changing it.

> Use this vault to find the context relevant to my question.

> Remember this decision in the vault.

The last prompt may ask for confirmation. New vaults default to explicit-only writes, so an agent
can read without gaining permission to save every conversation.

## What the boundary protects

Knowledge Loom makes the agent resolve these questions before it uses your notes:

1. Which one vault is in scope?
2. Which person, project, or other subject does the request concern?
3. Which notes are relevant?
4. Is the agent allowed to save a lasting change?
5. If the vault requires Git, sync, or backup, which steps actually completed?

Missing information stays unknown. A health fact recorded for Alex does not become a health fact
about Sam. A successful Git commit does not get reported as a successful backup. Vault content is
treated as data, while the checked-in contract and skill protocol control the workflow.

The skills do not run a Knowledge Loom service or upload vault contents to one. Your agent runtime,
Git remote, sync provider, and backup provider still have their own access and privacy rules.

## Claude Desktop and Cowork

Claude Desktop custom skills use a ZIP upload rather than the Claude Code plugin marketplace. Build
the self-contained ZIP from a checkout:

```bash
uv run python scripts/build_claude_desktop_skill.py
```

Upload `dist/knowledge-loom-claude-desktop.zip` through
`Customize → Skills → + Create skill → Upload a skill`, then enable it. To use local notes, start a
Cowork session and connect exactly one folder containing `KNOWLEDGE_VAULT.md`.

Regular Claude Chat cannot read an unconnected local folder. The Desktop adapter refuses local
vault claims without a connected Cowork folder and refuses writes when the session cannot complete
the lifecycle steps required by the vault.

## Use the CLI from a checkout

Use a local checkout when you are developing Knowledge Loom, want live symlinks, or prefer direct
CLI control:

```bash
git clone https://github.com/magickaichen/knowledge-loom.git
cd knowledge-loom
uv sync
python3 scripts/install.py
python3 scripts/install.py --apply
```

The installer previews first, refuses collisions, and links the four skills into both
`~/.agents/skills` and `~/.claude/skills`.

Preview a new vault:

```bash
uv run knowledge-loom init ~/Documents/example-vault \
  --vault-id example \
  --title "Example Vault" \
  --subject owner
```

Add `--apply` to create the contract. Use `--adopt` only when you deliberately add a contract to an
existing non-empty folder. Initialization does not rewrite existing notes or Git history.

Audit and register the vault:

```bash
uv run knowledge-loom audit ~/Documents/example-vault
uv run knowledge-loom register example ~/Documents/example-vault
uv run knowledge-loom register example ~/Documents/example-vault --apply
```

When more than one vault is registered, an unscoped request fails instead of guessing. Select a
vault by ID or path:

```bash
uv run knowledge-loom resolve example
```

## How it works

Every vault has a versioned `KNOWLEDGE_VAULT.md` contract. It declares the vault identity, subjects,
write rules, metadata profiles, focus views, Git history, sync, backup, and paths that must never be
tracked. The four skills use the same runtime-neutral protocol in Codex and Claude.

Read the [protocol](references/protocol.md) and
[contract schema](references/contract-schema.md) when you need the exact rules.

Knowledge Loom v1 works with local Markdown. It does not ingest remote source systems, provide
access control, encrypt notes, host a sync service, or reorganize an existing vault for you.

## Develop and validate

Fixtures are fictional and must not contain real work, health, family, credential, or private vault
data. Edit the top-level Python package, protocol, and schema rather than generated copies inside
individual skills.

Run the complete validation entrypoint before committing:

```bash
uv run python scripts/validate.py --npx
```

It checks generated skill packages, unit tests, fixture audits, the behavior-eval matrix, the
Claude Desktop ZIP, and a real `npx skills` copy installation. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the contribution workflow.

## License

Knowledge Loom is available under the [MIT License](LICENSE).
