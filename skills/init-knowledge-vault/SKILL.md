---
name: init-knowledge-vault
description: Create a new governed local Markdown knowledge vault or progressively adopt an existing Markdown vault into the Knowledge Vault Protocol. Use when the user asks to create, initialize, bootstrap, register, migrate, or adopt a knowledge base or vault, including single-subject and shared multi-subject vaults.
---

# Initialize Knowledge Vault

Create or adopt one vault without rewriting historical content by default.

## Load the protocol

Resolve the package root as the directory two levels above this `SKILL.md`. Read
`references/protocol.md` and `references/contract-schema.md` completely before proposing changes.

## Establish the contract

Resolve these decisions from the user request or existing repository evidence:

- stable vault ID and title;
- new vault or adoption of an existing vault;
- one or more subjects and whether a safe default exists;
- durable write policy and separate current-state policy;
- local Markdown link style;
- Git history requirement;
- sync and backup lifecycle modes;
- instruction roots and navigation entrypoints;
- metadata profiles by path;
- privacy paths that must never be tracked;
- optional named focus views.

Default every new vault to `explicit-only` writes and `explicit-only` current-state maintenance.
Never enable proactive capture, cross-vault access, remote sync, or backup destinations implicitly.

## Preview first

For a new vault, preview:

```bash
uv run --project <package-root> knowledge-loom init <vault-path> \
  --vault-id <id> \
  --title "<title>" \
  --subject <subject>
```

Add `--history git`, additional `--subject` values, or explicit policy flags only when resolved.

For an existing vault, add `--adopt`. The adoption preview may discover an existing instruction
root and navigation entrypoint, but must not rewrite notes.

Show the proposed `KNOWLEDGE_VAULT.md`, structural changes, metadata gaps, privacy risks, and
lifecycle implications. Do not apply until the user authorizes the write.

## Apply narrowly

After authorization, rerun the same command with `--apply`.

- For a new vault, create the contract and a minimal index.
- For adoption, add only the contract and explicitly approved pointer changes.
- Do not bulk rename files, backfill frontmatter, rewrite links, or reorganize history.
- Grandfather existing content when safe. Repair metadata incrementally when a note is touched or
  when a high-risk path requires immediate enforcement.
- Run any bulk repair as a separate dry-run workflow with separate authorization.

## Register deterministically

Preview registry change:

```bash
uv run --project <package-root> knowledge-loom register <vault-id> <vault-path>
```

Apply only after confirming the resolved path:

```bash
uv run --project <package-root> knowledge-loom register <vault-id> <vault-path> --apply
```

Never replace another vault's registry entry silently.

## Validate

Run `audit-knowledge-vault` after applying. If Git is enabled, preserve unrelated changes, review
the diff, and follow the new contract's commit, sync, and backup rules. Adoption is complete when
the governed workflows can operate safely, not when every historical note is cosmetically uniform.
