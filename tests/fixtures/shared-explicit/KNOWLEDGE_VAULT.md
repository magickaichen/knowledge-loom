---
schema_version: 1
vault_id: shared-home
title: Shared Home Vault
storage:
  type: local-markdown
  link_style: markdown
subjects:
  mode: multiple
  values: [alex, sam, shared]
write:
  policy: explicit-only
  current_state_policy: explicit-only
history:
  type: none
  commit_policy: none
sync:
  mode: none
backup:
  mode: none
instruction_roots: [AGENTS.md]
navigation:
  entrypoints: [INDEX.md]
metadata_profiles:
  personal-health:
    paths: ["Health/**/*.md"]
    required: [owner, status, updated, sensitivity]
    severity: error
  shared-action:
    paths: ["Actions/**/*.md"]
    required: [owner, status, updated]
    severity: error
focus_views:
  shared:
    path: Actions/Now.md
    subject: shared
    active_section: Top of mind
    max_active: 1
    max_top: 2
    require_start_here: true
privacy:
  never_track: ["Local-Only/**"]
---

# Vault policy

Everything committed is visible to Alex and Sam. `owner` is a subject label, not access control.
