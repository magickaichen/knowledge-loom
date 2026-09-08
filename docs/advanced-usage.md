# Advanced usage

Return to the [quick start](../README.md#set-up-your-first-vault).

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
instead of silently choosing another vault. Linked Git worktrees inherit the main checkout's
association through their Git common directory, so temporary worktrees do not need separate
registry entries. A direct worktree association still takes precedence when one exists.

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
instead of being silently skipped. See the [contract schema](../references/contract-schema.md) for its
JSON result interface. Custom checkers require a command-capable runtime such as Codex, Claude Code,
or the CLI. The instruction-only Claude Desktop adapter reports the combined audit as incomplete
when a checker is declared; it never pretends the checker ran.

## Claude Desktop and Cowork

Claude Desktop custom skills use a ZIP upload rather than the Claude Code plugin marketplace.
Download `knowledge-loom-claude-desktop-vX.Y.Z.zip` from the
[latest release](https://github.com/magickaichen/knowledge-loom/releases/latest), then upload it
through `Customize → Skills → + Create skill → Upload a skill` and enable it.

To build the same self-contained ZIP from a checkout:

```bash
npm ci
node --import tsx scripts/build-claude-desktop-skill.ts
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
npm run install:skills
npm run install:skills -- --apply
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

## Optional writing companion

Matt Pocock's [`writing-for-agents`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md)
skill is an optional companion, not a prerequisite. When it is already available in the active
agent, `use-knowledge-vault` invokes the unmodified skill only after an authorized Distill write
will create or restructure an agent-consumed note or navigation pointer. It can improve
structure and retrieval quality, but it cannot expand Knowledge Loom's authority or lifecycle
boundaries. Without the companion, Knowledge Loom applies its built-in agent-readable writing gate
and completes the same authorized workflow.
