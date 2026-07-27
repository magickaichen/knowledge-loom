---
schema_version: 1
vault_id: acme-work
title: Acme Work Vault
storage:
  type: local-markdown
  link_style: markdown
subjects:
  mode: single
  values: [alex]
  default: alex
write:
  policy: proactive-durable-capture
  current_state_policy: maintain-after-material-change
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
  project-note:
    paths: ["Projects/**/*.md"]
    required: [created, updated, status]
    severity: error
focus_views:
  work:
    path: Projects/current-focus.md
    subject: alex
    active_section: Top of mind
    max_active: 1
    max_top: 2
    require_start_here: true
privacy:
  never_track: [".secrets/**"]
---

# Vault policy

Use this fixture for fictional Acme work only. Source records remain authoritative.
