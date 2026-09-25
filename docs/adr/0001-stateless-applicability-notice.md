---
status: proposed
---

# Deliver a stateless applicability notice on every turn

Models in vault-linked projects often skip vault activation, because nothing in their context tells
them that automatic applicability selects a vault for the current directory. Runtime hooks now
deliver an **applicability notice** on SessionStart and on every UserPromptSubmit, computed from the
event's `cwd`. The hook stays stateless: the model judges from its own context whether the session
already has **vault activation**, activates once when it does not, and retrieves only when a request
reaches knowledge not yet retrieved. The notice is a reminder; the applicability probe still selects
the vault, so a registry change mid-session takes effect at the next probe.

This status stays `proposed` until the prototype shows that the notice produces activation on the
first substantive request and no repeated activation later in the same session.

## Considered options

- **Hook-tracked activation state**, injecting only until activation is observed. Rejected: the
  activation signal differs per runtime (Claude exposes a Skill tool call; Codex exposes only
  transcript contents), which breaks runtime neutrality, and a hook cannot observe compaction
  discarding the activated context.
- **Vault primer injection**, placing navigation or note content directly in the notice. Rejected:
  it bypasses contract governance and inbound access freshness, and a real navigation entrypoint
  is too large to inject every turn.
- **SessionStart only**. Rejected: the reminder fades in long sessions and misses mid-session
  directory changes.

## Consequences

- Each turn in a vault-linked directory pays a notice of roughly fifty tokens; activation cost
  is paid once per session and again after compaction.
- The notice carries only vault identity, root, selection source, and the conditional instruction.
  Policy comes from the contract during activation.
- Runtimes without hooks keep the existing instruction-file route, so the notice accelerates the
  applicability decision without becoming a dependency.
