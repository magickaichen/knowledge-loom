---
name: init-knowledge-vault
description: Initialize a governed Markdown vault, conservatively adopt an existing one, register it, or associate a project with it. Use for vault contracts, deterministic registration or project linking, and protocol adoption without bulk migration.
compatibility: Requires Node.js 20+ and local file/command access.
---

# Initialize Knowledge Vault

Create or adopt one vault through a previewed contract change.

## Load authority

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/protocol.md` and
`<skill-root>/references/contract-schema.md` completely before proposing changes.

## Establish the contract

Map every required schema field to user input, repository evidence, or a named safe default. Resolve
these decision groups:

- identity, target path, and new-versus-adopt mode;
- subjects and any safe default subject;
- write authority, history, sync, and backup;
- instruction roots, navigation entrypoints, metadata profiles, and privacy paths;
- optional focus views.

Default every new vault to `explicit-only` writes and `explicit-only` current-state maintenance.
Never enable proactive capture, cross-vault access, remote sync, or backup destinations implicitly.
Ask only for unresolved choices that would change identity, authority, subject isolation, privacy, or
lifecycle scope. This step is complete when every required field has evidence or a stated safe
default.

## Preview first

Use the CLI help as the command source:

```bash
node "<skill-root>/scripts/knowledge-loom.mjs" init --help
```

Build and run the resolved `init` command without `--apply`. Use adoption mode only for an existing
non-empty vault. The preview may discover instruction roots and navigation entrypoints; historical
notes remain unchanged.

Show the proposed `KNOWLEDGE_VAULT.md`, structural changes, metadata gaps, privacy risks, and
lifecycle implications. Preview is complete when the user can distinguish proposed files, known
gaps, and later migration work. Apply only after the user authorizes that exact preview.

## Apply narrowly

After authorization, rerun the exact previewed command with `--apply`.

- For a new vault, create the contract and a minimal index.
- For adoption, add only the contract and explicitly approved pointer changes.
- Preserve existing names, frontmatter, links, and history. Grandfather safe content and repair it
  incrementally when touched or when a high-risk path requires immediate enforcement.
- Treat bulk repair or taxonomy migration as a separate previewed workflow with separate
  authorization.

## Register deterministically

When registration is requested, inspect
`node "<skill-root>/scripts/knowledge-loom.mjs" register --help`, preview the resolved ID and
canonical path, then apply the same registry change only after confirmation. Preserve every
existing registry entry; an ID already bound to another path is a conflict, not an update.

## Associate a project

When project association is requested, inspect
`node "<skill-root>/scripts/knowledge-loom.mjs" associate --help`. Resolve the registered vault ID
and canonical project directory, then run `associate` without `--apply`. Apply the same preview only
after confirmation. Preserve other project associations; replace an existing binding only when the
user explicitly approves `--replace`.

## Validate and report

Run `audit-knowledge-vault` after applying. If Git is enabled, preserve unrelated changes, review
the diff, and follow the protocol's lifecycle rules. Report whether the operation stopped at
preview, contract application, registration, audit, commit, sync, or backup. Initialization is
complete when the contract passes its required audit checks and every required lifecycle state is
known; cosmetic uniformity of historical notes is outside this workflow.
