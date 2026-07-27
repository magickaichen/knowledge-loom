---
name: audit-knowledge-vault
description: Run a read-only audit of a governed local Markdown knowledge vault. Use when the user asks to audit, inspect, validate, diagnose, or check a vault contract, registry resolution, metadata profiles, subject isolation, focus invariants, privacy paths, links, Git safety, or lifecycle configuration without modifying the vault.
---

# Audit Knowledge Vault

Inspect one vault without changing files, Git state, registry state, external systems, or lifecycle
destinations.

## Resolve scope

Resolve the package root as the directory two levels above this `SKILL.md`. Read
`references/contract-schema.md`. Resolve exactly one vault using an explicit path or ID, the nearest
ancestor contract, or an unambiguous registry. Stop on ambiguity.

## Run deterministic audit

Execute:

```bash
uv run --project <package-root> knowledge-loom audit <vault-path-or-id>
```

Use `--json` when another test or script will consume the findings.

The deterministic audit checks:

- contract schema and supported policy values;
- declared instruction roots and navigation entrypoints;
- path-scoped metadata requirements;
- declared subjects used by personal notes;
- Git requirement and dirty-state visibility;
- tracked files that violate privacy patterns;
- configured focus-file existence, WIP limits, and unique Start here;
- lifecycle adapter declarations.

Do not treat a dirty tree as corruption. It is an operational fact that must constrain later writes.

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

Keep this phase read-only. Recommend repairs and their risk; do not implement them unless the user
separately asks for changes.

## Report

Lead with pass, pass-with-warnings, or fail. Separate:

- **Errors**: contract or safety violations that make governed writes unsafe.
- **Warnings**: drift or incomplete policy that merits review.
- **Info**: facts such as a dirty tree that affect the next operation.

Give one Start here repair and at most two immediate follow-ups. Preserve remaining findings under
Later. Cite exact paths without exposing unnecessary sensitive content.
