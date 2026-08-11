---
name: audit-knowledge-vault
description: Audit one governed Markdown vault without modifying it. Use for contract, registry, metadata, subject, focus, privacy, Git, link, or lifecycle validation.
---

# Audit Knowledge Vault

Inspect one vault without changing files, Git state, registry state, external systems, or lifecycle
destinations.

## Load authority and resolve scope

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<package-root>` to the
parent of the `skills/` directory containing that canonical path. Read
`<package-root>/references/contract-schema.md` and
`<package-root>/references/protocol.md` completely. Resolve one vault through **Select one vault**;
ambiguity ends the audit before any vault is inspected.

## Run deterministic audit

Use `knowledge-loom audit --help` as the command source, then audit the selected path or ID. Use
`--json` only when another tool will consume the result. Treat the command output and exit status as
the source of truth for deterministic coverage rather than restating its implementation here.

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
