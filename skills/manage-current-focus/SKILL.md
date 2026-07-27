---
name: manage-current-focus
description: Review or update one bounded current-focus view declared by a governed knowledge vault. Use when the user asks to prioritize, replan, choose what to do now, add or remove a commitment, mark work complete, blocked, waiting, or deferred, maintain a current-focus note, or reconcile new source evidence with existing priorities.
---

# Manage Current Focus

Maintain one operational attention view without turning it into a full backlog or silently adding
parallel work.

## Resolve one view

Resolve the package root and selected vault as defined by `use-knowledge-vault`. Read
`KNOWLEDGE_VAULT.md`, the selected focus view, and only the linked current notes needed for the
decision.

- Use an explicitly named view when provided.
- Use the only configured view when exactly one exists.
- Ask when multiple views are plausible.
- Never merge personal and shared views automatically.

If the vault declares no focus view, explain that the extension is not enabled; do not invent one
without initialization authorization.

## Establish current evidence

Treat the focus file as an attention view, not the source of truth. Verify unstable completion,
blocking, ownership, deadline, or priority claims in declared authoritative sources before changing
the view.

Distinguish:

- discussion from a commitment;
- possible work from accepted work;
- active execution from Next;
- dependency waiting from voluntary deferral;
- durable project status from the compact focus view.

## Apply the configured selection lens

Use the vault-specific policy text for selection criteria. Do not import another vault's career,
health, household, or organizational lens.

For every candidate, require:

- why it deserves attention now;
- an executable next action;
- owner or dependency when relevant;
- a concrete done condition;
- an authoritative source or durable linked note;
- a restart point when interruption is likely.

Respect `max_top` and `max_active`. Keep exactly one Start here when required. A new top item must
name the item moved to Next, Waiting, Later, or Not now. Never create a hidden fourth priority.

## Decide whether a write is authorized

Read `write.current_state_policy`:

- `explicit-only`: edit only on explicit user request.
- `maintain-after-material-change`: edit after sourced addition, completion, block, unblock,
  removal, or genuine reprioritization.

Discussion or a generated recommendation alone is not a material state change.

Before editing, record Git status and preserve pre-existing target changes. Keep project history and
design detail in linked notes rather than expanding the focus file.

## Validate and finish

Run:

```bash
uv run --project <package-root> knowledge-loom audit <vault-path>
```

Confirm WIP limits, unique Start here, source links, explicit displacement, and the selected
subject/view. Then follow the vault's commit, sync, and backup lifecycle. Report the new Start here,
the displaced or completed item, and the exact lifecycle state.
