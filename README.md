# Knowledge Loom

Give Codex and Claude a safe way to use the notes you already keep.

Your Markdown notes contain decisions, plans, project history, and personal context. Point an agent
at the folder and it still has to guess which vault you meant, whose facts it found, and whether it
may save what it learned.

Knowledge Loom adds a small rules file to your Markdown folder. That file tells the agent what the
vault contains, how to find the right notes, and where reading stops and writing begins. It works
with ordinary Markdown folders, including Obsidian vaults.

## Installation

Pick one route. The plugin routes install Knowledge Loom as a managed bundle. The `npx` route
copies ordinary skill folders that you can inspect and edit. Installing both routes for the same
agent gives it duplicate copies of every skill.

Every route needs Python 3.11+ and [uv](https://docs.astral.sh/uv/). The `npx` route also needs
Node.js.

<details open>
<summary><strong>Recommended: Codex and Claude Code together</strong></summary>

Install all four skills for both agents with one command:

```bash
npx skills add magickaichen/knowledge-loom --skill '*' --global --agent codex claude-code --copy --yes
```

Each copied skill carries its own rules and runner, so it does not depend on the original repository
checkout. Use `npx skills update --global` when you want to pull a newer version.

</details>

<details>
<summary><strong>Codex plugin</strong></summary>

```bash
codex plugin marketplace add magickaichen/knowledge-loom && codex plugin add knowledge-loom@knowledge-loom
```

Start a new Codex task after installation.

</details>

<details>
<summary><strong>Claude Code plugin</strong></summary>

```bash
claude plugin marketplace add magickaichen/knowledge-loom && claude plugin install knowledge-loom@knowledge-loom
```

Run `/reload-plugins` in an existing session, or start a new one.

</details>

Private repositories work when Git, GitHub CLI, or SSH credentials can read them. A public
repository can be installed without GitHub authentication.

## Set up your first vault

### 1. Preview

Open your Markdown folder in Codex or Claude Code and ask:

> Initialize this folder as a knowledge vault. Show me the preview and do not write anything yet.

Knowledge Loom proposes a vault ID, subject, write policy, and files. It stops at the preview.

### 2. Approve

Check the proposal, then tell the agent to apply it. New vaults default to explicit-only writes, so
permission to read your notes does not become permission to save every conversation.

### 3. Use it

Try any of these:

> Audit this knowledge vault without changing it.

> Use this vault to find the context relevant to my question.

> Remember this decision in the vault.

The last request may need confirmation, depending on the vault's write policy.

## Why this exists

An agent with access to your notes is useful only when its boundaries are clear. Knowledge Loom
makes the agent settle five questions before it acts:

1. Which one vault is in scope?
2. Which person, project, or other subject does the request concern?
3. Which notes are relevant?
4. May the agent save a lasting change?
5. If the vault requires Git, sync, or backup, which steps actually completed?

This prevents four common failures. The agent cannot choose a vault because its topic looks
similar, transfer Alex's health facts to Sam, turn a useful conversation into a silent write, or
report a Git commit as a successful backup. Missing information stays unknown.

The skills do not upload notes to a Knowledge Loom service. Your agent runtime, Git remote, sync
provider, and backup provider still have their own access and privacy rules.

## The four skills

- [`init-knowledge-vault`](skills/init-knowledge-vault/SKILL.md) previews and initializes a new
  vault, or carefully adopts an existing folder.
- [`audit-knowledge-vault`](skills/audit-knowledge-vault/SKILL.md) checks the rules file, metadata,
  privacy paths, Git state, and focus views without modifying the vault.
- [`use-knowledge-vault`](skills/use-knowledge-vault/SKILL.md) retrieves the smallest useful set of
  notes and handles approved updates.
- [`manage-current-focus`](skills/manage-current-focus/SKILL.md) maintains one short list of what
  matters now.

Codex and Claude load these skills when a request matches. You can also name a skill directly when
you want a specific workflow.

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

Preview a vault from the command line:

```bash
uv run knowledge-loom init ~/Documents/example-vault \
  --vault-id example \
  --title "Example Vault" \
  --subject owner
```

Add `--apply` to create the rules file. Use `--adopt` only when you deliberately add one to an
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

The rules file is a versioned `KNOWLEDGE_VAULT.md` contract. It declares the vault identity,
subjects, write rules, metadata profiles, focus views, Git history, sync, backup, and paths that
must never be tracked. The four skills use the same runtime-neutral protocol in Codex and Claude.

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
