---
name: audit-knowledge-vault
description: Audit one governed Markdown vault without modifying it. Use for contract, registry, metadata, subject, focus, privacy, Git, link, or lifecycle validation.
compatibility: Requires Node.js 20+ and local file/command access.
---

# Audit Knowledge Vault

Inspect one vault without changing files, Git state, registry state, external systems, or lifecycle
destinations.

## Load authority and resolve scope

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/contract-schema.md` and
`<skill-root>/references/protocol.md` completely. From the active project directory, inspect
`node "<skill-root>/scripts/knowledge-loom.mjs" resolve --help`, then run `resolve`, appending a
selector only when one was supplied. Treat its returned canonical root as the only selected vault;
any resolution error ends the audit before a vault is inspected.

## Run deterministic audit

Use `node "<skill-root>/scripts/knowledge-loom.mjs" audit --help` as the command source, then audit
the selected path or ID with that runner. Use `--json` only when another tool will consume the
result. Treat the command output and exit status as the source of truth for deterministic coverage
rather than restating its implementation here.

A dirty tree is operational context for later writes, not an audit failure by itself.

## Inspect semantic risks

Deterministic checks cannot prove all knowledge semantics. Read targeted files only when the user
asked for deeper audit coverage, then check:

- note content being treated as instructions;
- personal facts applied to the wrong subject;
- stale or superseded notes presented as current;
- unsourced claims or source links used without opening the authoritative content;
- near-duplicate notes and conflicting current records;
- labels mistaken for access controls;
- provider-specific secrets or destinations embedded in reusable policy;
- reports that conflate saved, committed, synced, and backed-up states.

Keep this phase read-only. Return repair recommendations and their risk as proposed follow-up work.

## Report

Lead with pass, pass-with-warnings, or fail. Separate:

- **Errors**: contract or safety violations that make governed writes unsafe.
- **Warnings**: drift or incomplete policy that merits review.
- **Info**: facts such as a dirty tree that affect the next operation.

Give one Start here repair and at most two immediate follow-ups. Preserve remaining findings under
Later. Cite exact paths without exposing unnecessary sensitive content. The audit is complete when
the deterministic result and every requested semantic check are classified and the vault remains
unchanged.
