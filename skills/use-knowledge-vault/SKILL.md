---
name: use-knowledge-vault
description: Apply one governed Markdown vault automatically around substantive local project work when an ancestor contract or project association may exist; also handle explicit requests to consult, remember, update, or sync vault knowledge.
---

# Use Knowledge Vault

Requires Node.js 20+ and local file/command access.

Execute the Knowledge Vault Protocol for one selected vault while keeping the primary task first.
Limit actions to the primary task and contract-authorized vault operations.

## Load the protocol

Resolve this `SKILL.md` to its canonical path, following symlinks. Set `<skill-root>` to the
directory containing that canonical file. Read `<skill-root>/references/protocol.md` completely
before vault access; it is the installed source of truth for authority, selection, retrieval, write
policy, lifecycle, and failure behavior.

## Run the loop

1. From the active project directory, inspect both
   `node "<skill-root>/scripts/knowledge-loom.mjs" probe --help` and `resolve --help`.
2. Choose the entry mode:
   - For ordinary substantive work, run `probe`. Treat implementation, planning, prioritization,
     review, research synthesis, decisions, and durable communication as substantive. When it
     returns `NO_APPLICABLE_VAULT`, continue the primary task without vault work or a selection
     question.
   - When the user explicitly requests a vault operation, run `resolve`. Append a selector only
     when the user or invoking wrapper supplied one, and apply the protocol's selection failure
     behavior.
3. Treat the returned canonical root as the only selected vault, read its contract completely, and
   complete **Retrieve** before finishing the primary task. Use only context that materially affects
   its result.
4. Evaluate **Write authorization** after the primary task. Enter **Distill** only when the selected
   policy and current request authorize a vault change. When that branch will create or restructure
   an agent-consumed note or navigation pointer, apply the protocol's **Agent-readable
   writing** gate. If the active skill catalog exposes `writing-for-agents`, invoke that unmodified
   companion at this point for structure, context pointers, information hierarchy, co-location, and
   pruning, then complete the protocol gate. Its absence selects the built-in gate and does not
   block the authorized write.
5. After any write, run the deterministic audit:

   ```bash
   node "<skill-root>/scripts/knowledge-loom.mjs" audit <vault-path>
   ```

   This single audit includes any read-only content checker declared by the contract and configured
   in the local registry; do not invoke that checker separately. Pass the same non-default registry
   path used during resolution. The write branch is complete only after the combined audit result
   and every required Git, sync, and backup state are known. Preserve a valid partial result when a
   later lifecycle step fails.

## Report

Lead with the primary outcome. Name vault context only when it changed that outcome. For a write,
list every affected note and its exact saved, validated, committed, synced, and backed-up state. For
a blocked write, apply the protocol's failure behavior and return one capture candidate when useful.
