---
name: manage-current-focus
description: Prioritize or update one declared current-focus view in a governed vault. Use to accept, complete, block, defer, or reorder commitments, or reconcile sourced status with current attention.
---

# Manage Current Focus

Maintain one operational attention view without turning it into a full backlog or silently adding
parallel work.

## Load authority and resolve one view

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/protocol.md` completely,
then resolve one vault through **Select one vault**. Read its `KNOWLEDGE_VAULT.md`, the selected
focus view, and only the linked current notes needed for the decision.

- Use an explicitly named view when provided.
- Use the only configured view when exactly one exists.
- Ask when multiple views are plausible.
- Never merge personal and shared views automatically.

If the vault declares no focus view, report that focus management is not configured and propose
initialization as separate follow-up work.

## Select review or update

- **Review:** analyze the configured view and return a recommendation without editing it.
- **Update:** evaluate the protocol's current-state write authorization. Continue only when the
  policy and request or sourced material change authorize an edit.

This branch is resolved when the operation is explicitly read-only or an authorized material state
change has been identified.

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

## Apply an authorized update

Before editing, follow the protocol's pre-write Git and preservation steps. Keep project history and
design detail in linked notes rather than expanding the focus file. Apply the smallest edit that
records the accepted state change and explicit displacement.

## Validate and finish

After an edit, run:

```bash
uv run "<skill-root>/scripts/knowledge-loom.py" audit <vault-path>
```

Confirm WIP limits, unique Start here, source links, explicit displacement, and the selected
subject/view. Then follow the protocol's commit, sync, backup, and failure behavior. For a review,
report the recommended Start here and displacement without claiming a write. For an update, report
the new Start here, the displaced or completed item, every affected path, and the exact lifecycle
state. Completion requires all configured focus invariants to hold and every required lifecycle
state to be known.
