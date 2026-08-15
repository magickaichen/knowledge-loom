# `KNOWLEDGE_VAULT.md` schema version 1

The contract consists of YAML frontmatter followed by Markdown policy text. The frontmatter is
machine-validated; the body holds vault-specific interpretation, privacy, destination, and domain
rules that do not fit a portable schema.

## Required fields

- `schema_version`: integer `1`.
- `vault_id`: stable kebab-case identifier.
- `title`: human-readable title.
- `storage.type`: `local-markdown`.
- `subjects.mode`: `single` or `multiple`.
- `subjects.values`: non-empty unique subject IDs.
- `write.policy`: `explicit-only` or `proactive-durable-capture`.
- `write.current_state_policy`: `explicit-only` or `maintain-after-material-change`.
- `history.type`: `git` or `none`.
- `sync.mode`: `none`, `git-remote-push`, or `lifecycle-hook`.
- `backup.mode`: `none` or `lifecycle-hook`.
- `instruction_roots`: existing paths to instruction files.
- `navigation.entrypoints`: existing navigation files.

For `subjects.mode: single`, set `subjects.default` to the only subject. For multiple subjects,
omit the default unless the vault truly has a safe global default.

## Metadata profiles

Define profiles as a mapping:

```yaml
metadata_profiles:
  personal-record:
    paths: ["Health/**/*.md", "People/**/*.md"]
    required: [owner, status, updated, sensitivity]
    severity: error
```

Use standard semantic fields where applicable: `owner` or `subject`, `status`, `created`, `updated`,
`sensitivity`, `effective_date`, `review_after`, `source`, and `confidence`. A vault need not use
every field. Paths not matched by a profile are not forced into one.

## Focus views

Declare zero or more named focus views:

```yaml
focus_views:
  work:
    path: Projects/current-focus.md
    subject: owner
    active_section: Top of mind
    max_active: 2
    max_top: 3
    require_start_here: true
```

When more than one view exists, select a view explicitly. Do not merge views automatically.

## Path boundary

Every contract path and path pattern is vault-relative and uses `/` separators. Absolute paths,
Windows drive paths, `..` traversal, and symlinks that resolve outside the selected vault are
invalid. This boundary applies to instruction roots, navigation entrypoints, metadata profile
patterns, focus views, and privacy patterns.

Treat a boundary failure as an audit error before reading the target. Provider destinations and
registry locations are configured outside these contract path fields.

## Vault-specific content checks

Declare one optional read-only content checker by its kebab-case adapter ID:

```yaml
content_checks:
  adapter: example-content-check
```

The contract names the requirement but contains no executable command. Configure the adapter in
the local user registry, outside the vault:

```yaml
content_check_adapters:
  example-content-check:
    executable: node
    arguments:
      - "{vault_root}/scripts/check-content.mjs"
      - "--root={vault_root}"
      - --json
```

`{vault_root}` expands to the selected canonical vault root and is the only supported placeholder.
The runner starts the executable directly without a shell, from that root, with a 30-second timeout
and a 1 MiB output limit. Register only trusted adapters whose interface is read-only.

The checker writes one JSON object to stdout and uses exit `0` for `pass`, `1` for `fail`, or `2`
for `error`:

```json
{
  "status": "pass",
  "root": "/absolute/canonical/vault",
  "validationDate": "2026-08-12",
  "findings": []
}
```

Each finding requires `severity` (`error`, `warning`, or `info`), `code`, `message`, and an explicit
vault-relative `path` or `null`; `line` is an optional positive integer. `root` must be the exact
absolute canonical vault root, and `validationDate` must be a real calendar date. Merged findings
retain their adapter `source` and `validationDate`. The status, exit code, root, and findings must
agree. Adapter absence, invalid configuration, unsafe paths, invalid JSON, timeout, and inconsistent
results are audit errors. Built-in contract errors stop the checker from running.

## Privacy paths

List paths that must never be tracked:

```yaml
privacy:
  never_track: ["Local-Only/**", ".obsidian/**"]
```

The auditor checks tracked Git paths against these patterns. Labels such as `owner` and
`sensitivity` are metadata, not access controls.

## Lifecycle adapters

Provider-specific details stay outside the contract's portable core:

```yaml
backup:
  mode: lifecycle-hook
  adapter: verified-bundle-backup
  required_after_commit: true
```

The adapter name identifies an installed private workflow. Never put credentials, tokens, personal
account secrets, or sensitive destination material in a reusable template.
