# Knowledge Loom

Give any agent that supports Agent Skills a safe way to use the notes you already keep.

Knowledge Loom is agent-neutral. Its four skills are ordinary `SKILL.md` folders, each with its
own instructions, references, and a self-contained JavaScript runner. Install them with `npx skills` in Codex, Cursor,
OpenCode, Claude Code, and
[other supported agents](https://github.com/vercel-labs/skills#supported-agents). The Claude Code
and Codex plugins package those same four skill folders.

Your Markdown notes contain decisions, plans, project history, and personal context. Point an agent
at the folder and it still has to guess which vault you meant, whose facts it found, and whether it
may save what it learned.

Knowledge Loom adds a small rules file to your Markdown folder. That file tells the agent what the
vault contains, how to find the right notes, and where reading stops and writing begins. It works
with ordinary Markdown folders, including Obsidian vaults.

## Installation

Pick one route for each agent. Installing through both `npx skills` and a plugin gives the same
agent duplicate copies of every skill.

Codex, Claude Code, and other command-capable agents need Node.js 20+ for the deterministic runner.
The runner already contains its YAML parser: an installed skill does not run `npm install`, use a
package manager, or fetch code on first use. A compatible agent must support Agent Skills, local
file access, and local command execution. A web chat without those capabilities cannot use a local
vault directly. The Claude Desktop ZIP is instruction-only and does not require Node.js.

<details open>
<summary><strong>Codex and other supported agents: npx skills</strong></summary>

Run one command:

```bash
npx skills@latest add magickaichen/knowledge-loom
```

Select **Knowledge Loom** to install all four skills at once, or expand it to choose individual
skills. Then choose the agent or agents that should receive them.

The installer supports project and global installs. Each installed skill carries its own rules and
runner, so it does not depend on the original repository checkout. Use `npx skills update` when you
want to pull a newer version.

</details>

<details open>
<summary><strong>Claude Code: plugin</strong></summary>

```bash
claude plugin marketplace add magickaichen/knowledge-loom && claude plugin install knowledge-loom@knowledge-loom
```

Run `/reload-plugins` in an existing session, or start a new one.

</details>

<details>
<summary><strong>Codex: plugin</strong></summary>

```bash
codex plugin marketplace add magickaichen/knowledge-loom && codex plugin add knowledge-loom@knowledge-loom
```

Start a new Codex task after installation.

</details>

Private repositories work when Git, GitHub CLI, or SSH credentials can read them. A public
repository can be installed without GitHub authentication.

## Automatic use and direct invocation

For substantive local project work, `use-knowledge-vault` first probes for a vault contract in the
current directory tree or a registered project association. When neither exists, it exits the vault
workflow without selecting among unrelated registered vaults. When one applies, it retrieves
relevant context before the task and evaluates durable capture afterward. You can still name a skill
when you want a specific workflow. Invocation syntax depends on the agent and installation route:

| Installed with | Codex | Claude Code |
|---|---|---|
| `npx skills` | `$use-knowledge-vault` | `/use-knowledge-vault` |
| plugin | `$knowledge-loom:use-knowledge-vault` | `/knowledge-loom:use-knowledge-vault` |

The same naming rule applies to `init-knowledge-vault`, `audit-knowledge-vault`, and
`manage-current-focus`. These go in the agent prompt box, not in a shell. See the official
[Codex skill guide](https://learn.chatgpt.com/docs/build-skills) and
[Claude Code skill guide](https://code.claude.com/docs/en/slash-commands) for each runtime's
invocation model.

For example, with an `npx skills` install:

Codex:

```text
$use-knowledge-vault Find the decision context relevant to this project, then answer my question.
```

Claude Code:

```text
/use-knowledge-vault Find the decision context relevant to this project, then answer my question.
```

## Set up your first vault

### 1. Preview

Open your Markdown folder in your agent and paste the matching prompt. These examples assume an
`npx skills` install; add the `knowledge-loom:` namespace shown above for a plugin install.

Codex:

```text
$init-knowledge-vault Initialize this folder as a knowledge vault. Show me the preview and do not write anything yet.
```

Claude Code:

```text
/init-knowledge-vault Initialize this folder as a knowledge vault. Show me the preview and do not write anything yet.
```

Knowledge Loom proposes a vault ID, subject, write policy, and files. It stops at the preview.

### 2. Approve

Check the proposal, then tell the agent to apply it. New vaults default to proactive durable capture
and current-state maintenance. This one-time approval authorizes the defaults; the protocol still
captures only durable, sourced knowledge and excludes transient conversation, speculation, secrets,
and duplicates. Request `explicit-only` policies in the preview when a vault should require a fresh
write request every time.

### 3. Use it

Try any of these in Codex after setup. In Claude Code, replace `$` with `/`; add the plugin
namespace when applicable.

```text
$audit-knowledge-vault Audit this knowledge vault without changing it.
```

```text
$use-knowledge-vault Use this vault to find the context relevant to my question.
```

```text
$use-knowledge-vault Remember this decision in the vault.
```

The last request may need confirmation, depending on the vault's write policy.

## Link a project to a vault once

When you have several vaults, bind each project folder to its usual vault once. The skill can then
resolve that vault from the active project directory, so later prompts do not need a vault ID.

First make sure the vault is registered. Then open the project folder in Codex or Claude Code and
preview the association:

```text
$init-knowledge-vault Associate this project with the registered vault example. Preview only.
```

In Claude Code, use `/init-knowledge-vault`; use the namespaced form for a plugin install. Approve
the exact preview to save the association. After that, ordinary substantive prompts resolve
`example` automatically from anywhere inside the project; the user does not need to remember the
skill name:

```text
Implement the architecture decision we previously made for this project.
```

Knowledge Loom keeps vault IDs and project associations in the local user registry:

```text
~/.config/knowledge-vault/registry.yaml
```

Set `KNOWLEDGE_VAULT_REGISTRY` to use another registry file. The registry has this shape:

```yaml
schema_version: 1
vaults:
  example:
    path: /Users/you/Documents/example-vault
projects:
  /Users/you/code/example-project:
    vault_id: example
```

The registry stays outside both repositories. An explicit ID or path still wins. Inside a vault,
the nearest `KNOWLEDGE_VAULT.md` wins. Otherwise, the nearest project association wins; nested
projects can deliberately override a parent association. A broken association stops resolution
instead of silently choosing another vault.

### Optional vault-specific content checks

The normal audit can also run one trusted, read-only checker for rules that belong to a particular
vault, such as its date or summary conventions. There is no second validation command: both the
skill and CLI still use `knowledge-loom audit` and return one combined report.

Name the checker in `KNOWLEDGE_VAULT.md`:

```yaml
content_checks:
  adapter: example-content-check
```

Keep its executable configuration in the local registry rather than the vault:

```yaml
content_check_adapters:
  example-content-check:
    executable: node
    arguments:
      - "{vault_root}/scripts/check-content.mjs"
      - "--root={vault_root}"
      - --json
```

The runner executes this argument list directly without a shell. Register only a checker you trust
to remain read-only. A missing, invalid, timed-out, or failed declared checker makes the audit fail
instead of being silently skipped. See the [contract schema](references/contract-schema.md) for its
JSON result interface. Custom checkers require a command-capable runtime such as Codex, Claude Code,
or the CLI. The instruction-only Claude Desktop adapter reports the combined audit as incomplete
when a checker is declared; it never pretends the checker ran.

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
  privacy paths, Git state, focus views, and any locally configured content checker without
  modifying the vault.
- [`use-knowledge-vault`](skills/use-knowledge-vault/SKILL.md) retrieves the smallest useful set of
  notes and handles approved updates.
- [`manage-current-focus`](skills/manage-current-focus/SKILL.md) maintains one short list of what
  matters now.

Compatible agents load these skills when a request matches. You can also name a skill directly when
you want a specific workflow.

## Claude Desktop and Cowork

Claude Desktop custom skills use a ZIP upload rather than the Claude Code plugin marketplace.
Download `knowledge-loom-claude-desktop-vX.Y.Z.zip` from the
[latest release](https://github.com/magickaichen/knowledge-loom/releases/latest), then upload it
through `Customize → Skills → + Create skill → Upload a skill` and enable it.

To build the same self-contained ZIP from a checkout:

```bash
npm ci
node scripts/build-claude-desktop-skill.mjs
```

To use local notes, start a Cowork session and connect exactly one folder containing
`KNOWLEDGE_VAULT.md`.

Regular Claude Chat cannot read an unconnected local folder. The Desktop adapter refuses local
vault claims without a connected Cowork folder and refuses writes when the session cannot complete
the lifecycle steps required by the vault. If a vault declares a custom content checker, the
Desktop adapter can report its manual checks but requires Codex, Claude Code, or the CLI to complete
the combined audit.

## Use the CLI from a checkout

Use a local checkout when you are developing Knowledge Loom, want live symlinks, or prefer direct
CLI control:

```bash
git clone https://github.com/magickaichen/knowledge-loom.git
cd knowledge-loom
npm ci
node scripts/install.mjs
node scripts/install.mjs --apply
```

The installer previews first, refuses collisions, and links the four skills into both
`~/.agents/skills` and `~/.claude/skills`.

Preview a vault from the command line:

```bash
npm run cli -- init ~/Documents/example-vault \
  --vault-id example \
  --title "Example Vault" \
  --subject owner
```

Add `--apply` to create the rules file. Use `--adopt` only when you deliberately add one to an
existing non-empty folder. Initialization does not rewrite existing notes or Git history.

Audit and register the vault:

```bash
npm run cli -- audit ~/Documents/example-vault
npm run cli -- register example ~/Documents/example-vault
npm run cli -- register example ~/Documents/example-vault --apply
```

Associate a project with the registered vault. Both registration and association preview by
default:

```bash
npm run cli -- associate example ~/code/example-project
npm run cli -- associate example ~/code/example-project --apply
```

Use `--replace` only when deliberately changing an existing project binding. When no contract or
project association applies and more than one vault is registered, an unscoped request fails
instead of guessing. Select a vault by ID or path:

```bash
npm run cli -- resolve example
```

Runtime adapters use a narrower probe for ordinary work. It returns only an ancestor or
project-associated vault and otherwise succeeds with `NO_APPLICABLE_VAULT`:

```bash
npm run cli -- probe
```

Existing vaults retain their declared write policies. Migrate one only after reviewing and
authorizing the corresponding `KNOWLEDGE_VAULT.md` change.

## How it works

The rules file is a versioned `KNOWLEDGE_VAULT.md` contract. It declares the vault identity,
subjects, write rules, metadata profiles, focus views, Git history, sync, backup, optional content
checker, and paths that must never be tracked. Every installation route uses the same
runtime-neutral protocol.

Read the [protocol](references/protocol.md) and
[contract schema](references/contract-schema.md) when you need the exact rules.

Knowledge Loom v1 works with local Markdown. It does not ingest remote source systems, provide
access control, encrypt notes, host a sync service, or reorganize an existing vault for you.

## Develop and validate

Fixtures are fictional and must not contain real work, health, family, credential, or private vault
data. Edit the top-level JavaScript modules, protocol, and schema rather than generated copies
inside individual skills.

Run the complete validation entrypoint before committing:

```bash
npm run validate:npx
```

It checks generated skill packages, unit tests, fixture audits, the behavior-eval matrix, the
Claude Desktop ZIP, and a real `npx skills` copy installation. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the contribution workflow.

## Releases

Knowledge Loom uses semantic version tags such as `v0.1.1`. Each version has a curated entry in the
[changelog](CHANGELOG.md). Pushing a matching tag runs the full local validation suite, checks that
the tag matches every package manifest and changelog entry, and publishes a GitHub Release with
those notes and a versioned Claude Desktop ZIP.

## License

Knowledge Loom is available under the [MIT License](LICENSE).
