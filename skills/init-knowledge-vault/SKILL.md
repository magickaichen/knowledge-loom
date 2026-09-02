---
name: init-knowledge-vault
description: Set up a governed Markdown vault that is useful immediately by organizing existing authorized work; also conservatively adopt, register, or associate an existing vault.
---

# Set up a useful knowledge vault

Requires Node.js 20+ and local file/command access.

Turn one setup request into a populated, registered vault through one previewed change.

## Load authority

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/protocol.md` and
`<skill-root>/references/contract-schema.md` completely before proposing changes.

## Select the flow

For an ordinary setup or create request, run the protocol's **Bootstrap a useful vault** workflow.
The invocation is the complete product input. Infer safe setup values and include them in the one
preview; multiple registered vaults do not require a preliminary selection question. Ask separately
only when no safe proposal can resolve identity, destination, privacy, or lifecycle authority.

Use contract-only governance initialization only when the user explicitly requests an empty
contract. Use adoption mode for an existing non-empty vault. A standalone registration or
project-association request skips bootstrap and changes only the requested registry state.

## Prepare one preview

Map every required schema field to user input, repository or source evidence, or a named safe
default. Default new and adopted vaults to `proactive-durable-capture` writes and
`maintain-after-material-change` current-state maintenance. Keep `explicit-only` available when the
user requests it. Never enable cross-vault access, remote sync, or backup implicitly.

Inspect the relevant CLI interfaces before constructing the preview:

```bash
node "<skill-root>/scripts/knowledge-loom.mjs" init --help
node "<skill-root>/scripts/knowledge-loom.mjs" register --help
node "<skill-root>/scripts/knowledge-loom.mjs" associate --help
```

Run `init` without `--apply`. Before showing the preview, inspect the current registry and any
active-project association so ID, path, and replacement conflicts are visible. Present the single
bootstrap preview required by the protocol and apply only after the user approves that exact bundle.

## Apply and finish

Rerun the exact previewed `init` command with `--apply`, then write the previewed contract details,
canonical notes, navigation, and current focus. Preserve existing content during adoption.

Run registration and applicable association without `--apply`; apply each only when its output
matches the approved preview. Stop on a conflict and preserve the valid partial result. A standalone
registration or association request receives its own preview before application.

Run `audit-knowledge-vault`. If Git is enabled, preserve unrelated changes and follow the protocol's
lifecycle rules. Report the exact discovery, preview, population, registration, association, audit,
commit, sync, and backup state. Apply the protocol's completion condition; a placeholder index is
not a completed setup.
