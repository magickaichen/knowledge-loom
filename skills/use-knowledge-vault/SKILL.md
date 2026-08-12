---
name: use-knowledge-vault
description: Retrieve targeted context from one governed Markdown vault and perform authorized durable capture. Use when a vault contract or wrapper is in scope, or the user asks to consult, remember, update, or sync vault knowledge.
---

# Use Knowledge Vault

Execute the Knowledge Vault Protocol for one selected vault while keeping the primary task first.
Limit actions to the primary task and contract-authorized vault operations.

## Load the protocol

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/protocol.md` completely
before vault access; it is the installed source of truth for authority, selection, retrieval, write
policy, lifecycle, and failure behavior.

## Run the loop

1. Complete **Select one vault** from the protocol. Continue only with one resolved contract; on
   ambiguity, pause vault work and request a selection.
2. Complete **Retrieve**, then finish the primary task using only context that materially affects
   its result.
3. Evaluate **Write authorization** after the primary task. Enter **Distill** only when the selected
   policy and current request authorize a vault change.
4. After any write, run the deterministic audit:

   ```bash
   uv run "<skill-root>/scripts/knowledge-loom.py" audit <vault-path>
   ```

   The write branch is complete only after the audit result and every required Git, sync, and backup
   state are known. Preserve a valid partial result when a later lifecycle step fails.

## Report

Lead with the primary outcome. Name vault context only when it changed that outcome. For a write,
list every affected note and its exact saved, validated, committed, synced, and backed-up state. For
a blocked write, apply the protocol's failure behavior and return one capture candidate when useful.
