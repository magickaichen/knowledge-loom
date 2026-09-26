---
status: accepted
---

# Deliver a stateless applicability notice on every turn

Models in vault-linked projects often skip vault activation, because nothing in their context tells
them that a vault applies to the current directory. Runtime hooks deliver an **applicability
notice**, computed from the event's `cwd`: at SessionStart it follows the existing static routing
text, which stays, and on every UserPromptSubmit it arrives alone. A directory with no applicable
vault receives no notice. The hook stays stateless: the model judges from its own context whether
the session already has **vault activation**, activates once when it does not, and retrieves only
when a request reaches knowledge not yet retrieved, within the user's own instructions for sourcing
claims. The notice is a reminder; the vault selection rules still choose the vault, so a registry
change mid-session takes effect at the next probe.

Vault activation begins with the `use-knowledge-vault` skill call. The per-access `route` call is a
maintenance check: it runs on every vault access, and the model rereads the contract and instruction
roots only when `route` reports vault status `integrated` or release status `updated`.

## Evidence

A prototype in a vault-linked project (Claude Code 2.1.283, Codex CLI 0.156.0; one run per cell,
so directional) supported the mechanism:

- Claude full activation on the first substantive request rose from 0/2 without the notice to 3/4
  with it. The miss ran `route --mode skill` and then read notes without the skill call.
- Codex already activated 2/2 without the notice and reloaded the skill on a later turn in one of
  two sessions; with the notice, no later substantive request repeated the skill call in either
  runtime.
- No ordinary-conversation prompt activated in any condition.
- Codex reread the contract and instruction roots on every later substantive turn (0/4 clean),
  following the routing instruction to reread before retrieval. That instruction conflicted with
  once-per-session activation and led to the conditional reread above.

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

- Each turn in a vault-linked directory pays for the notice, estimated at fifty to seventy tokens;
  activation is paid once per session, as the glossary defines it.
- The notice carries only vault identity, root, selection source, and the conditional instruction,
  in English. Policy comes from the contract during activation.
- A hook failure yields no notice and never blocks the prompt.
- The notice and the `use-knowledge-vault` description both name the skill call as the start of
  activation, which targets the `route`-without-skill miss.
- Runtimes without hooks keep the existing instruction-file route, so the notice accelerates the
  applicability decision without becoming a dependency.
