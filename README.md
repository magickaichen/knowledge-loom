# Knowledge Loom

Give any agent that supports Agent Skills a safe way to turn work you can already access into
reusable Markdown knowledge.

Knowledge Loom is agent-neutral. It adds a small rules file to an ordinary Markdown folder,
including an Obsidian vault, so agents know which vault you meant, whose facts belong where,
and when they may save changes.

## Installation

Requires an agent with Agent Skills, local file access, local command execution, and Node.js 20+.
Each installed skill includes one self-contained JavaScript runner and does not run `npm install`.

```bash
npx skills@latest add magickaichen/knowledge-loom
```

Select **Knowledge Loom** for all four skills, then choose your agent. Update with `npx skills update`,
or explicitly [bootstrap weekly stable release maintenance](docs/release-maintenance.md) outside the
installed skills. Release publication alone does not upgrade existing devices.

<details>
<summary>Plugin installation for Claude Code or Codex</summary>

Installing through both `npx skills` and a plugin gives the same agent duplicate skills. Choose one route.

**Claude Code**

```bash
claude plugin marketplace add magickaichen/knowledge-loom && claude plugin install knowledge-loom@knowledge-loom
```

Run `/reload-plugins` or start a new session.

**Codex**

```bash
codex plugin marketplace add magickaichen/knowledge-loom && codex plugin add knowledge-loom@knowledge-loom
```

Start a new Codex task.

</details>

For **Claude Desktop and Cowork**, use the [ZIP installation guide](docs/advanced-usage.md#claude-desktop-and-cowork).

## Set up your first vault

In your agent's prompt box, run:

```text
$init-knowledge-vault Set up my work vault.
```

In Claude Code, replace `$` with `/`. Plugin installs also add `knowledge-loom:` after the prefix.

The agent discovers recent work through source tools you have already authorized and previews
the vault location, notes, write policies, and project association. Approve the preview to create
a populated, registered vault. If no useful source is available, it names the missing access and stops.

New vaults allow proactive durable capture and current-focus maintenance after setup. Ask for
`explicit-only` policies in the preview if you want writes only on request.

## Everyday use

Work normally inside the vault or an associated project. The agent retrieves relevant context
before substantive tasks and evaluates what to save afterward, under the vault's rules.
Unassociated projects continue without vault access.

To request a specific action:

```text
$use-knowledge-vault Remember this decision in the vault.
```

| Skill | Use it to |
|---|---|
| [`init-knowledge-vault`](skills/init-knowledge-vault/SKILL.md) | Create or adopt a vault; associate a project. |
| [`use-knowledge-vault`](skills/use-knowledge-vault/SKILL.md) | Retrieve context and save authorized updates. |
| [`audit-knowledge-vault`](skills/audit-knowledge-vault/SKILL.md) | Check a vault without modifying it. |
| [`manage-current-focus`](skills/manage-current-focus/SKILL.md) | Maintain a short list of what matters now. |

<details>
<summary>Invocation syntax by agent</summary>

| Installed with | Codex | Claude Code |
|---|---|---|
| `npx skills` | `$use-knowledge-vault` | `/use-knowledge-vault` |
| Plugin | `$knowledge-loom:use-knowledge-vault` | `/knowledge-loom:use-knowledge-vault` |

Apply the same prefix to the other skill names. Enter these in the agent prompt box, not a shell.

</details>

## How it works

A versioned `KNOWLEDGE_VAULT.md` contract declares the vault's subjects, write rules, metadata,
focus views, and required Git, sync, and backup steps. Agents select one vault, keep subjects
separate, and report which lifecycle steps actually completed. Missing information stays unknown.

The skills do not upload notes to a Knowledge Loom service. Your agent runtime and storage
providers retain their own access and privacy rules.

- [Advanced usage](docs/advanced-usage.md): project associations, CLI commands, content checks,
  Claude Desktop, and the optional writing companion.
- [Daily inbound access](docs/inbound-access.md): opt-in remote observations, safe integration,
  local state, and cooperative write locking.
- [Protocol](references/protocol.md) and [contract schema](references/contract-schema.md): exact behavior and configuration.
- [Contributing](CONTRIBUTING.md): development, validation, and releases.
- [Changelog](CHANGELOG.md): version history.

## License

[MIT](LICENSE).
