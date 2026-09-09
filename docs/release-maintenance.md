# Stable release maintenance

Bootstrap a device once to keep the four Knowledge Loom skills on published stable releases.
The maintenance entry point lives outside the replaceable skills. Publishing a release does not
upgrade devices that have not completed bootstrap and wired the external call into their use path.
Requires Node.js 20+, Git, and a local POSIX filesystem with atomic symlink rename.

## Bootstrap and verify

Build the external entry point from a trusted checkout with `npm ci && npm run build:maintenance`,
or download `maintenance.cjs` from a published Knowledge Loom GitHub Release. Keep that file until
bootstrap succeeds. The `--source` checkout must contain the same four skills as the installation;
it may be an older release with no maintenance code. Local differences stop adoption before any
installed skill changes.

Run the entry point with the source checkout and every installation directory to maintain:

```bash
node dist/maintenance.cjs bootstrap --source /path/to/knowledge-loom \
  --target "$HOME/.agents/skills" --target "$HOME/.claude/skills"
node "$HOME/.local/share/knowledge-loom/maintenance.cjs" status
```

Bootstrap verifies the copied executable with `--help`, stages and validates the complete original
bundle, and converts only the four selected skill paths into links. `bootstrapped`, then `ready`,
confirms the external entry point and installation. Original directories or symlinks remain under
`~/.local/share/knowledge-loom/backups/`. An interrupted adoption resumes through `status` or
`bootstrap` without needing the source checkout.

The result identifies each original route: copied directory, checkout symlink, or `skills-cli`
bookkeeping. Existing manager records remain byte-identical; they describe the original manager
installation, while `status` owns the maintained version. Use this entry point for subsequent
updates. If another installer replaces the links, maintenance stops on a collision. Plugin-owned
Codex and Claude caches are refused: use the owning plugin manager for those installations rather
than editing its versioned cache or records. Bootstrap does not edit runtime configuration.

## Run on due use

Add this instruction to the runtime's user-level instructions, outside installed skill directories:

> Before using Knowledge Loom, run `node "$HOME/.local/share/knowledge-loom/maintenance.cjs" use`.
> Read its result, then resolve the installed skill to its canonical directory for this invocation.
> If maintenance reports failure, backoff, or busy, retain the usable installed bundle and report
> the recovery state when relevant to the task.

Verify the wiring by invoking it from each runtime and checking that they report the same
`entryPoint`, installed version, and `lastCheck`. This explicit caller setup is required even for
old skills; no ordinary-chat polling, background service, or scheduler is installed.

The first `use` checks immediately. Successful observations are shared across tasks and runtimes
using the same home. The next check becomes due after exactly seven elapsed days. A failed lookup
or installation leaves `lastCheck` unchanged. Each call makes at most one attempt; retry delay
starts at one minute, doubles, and caps at six hours. `recovery` retains the error and retry time.
A changed pin schedules a check but does not bypass an outstanding failure backoff.

```bash
node "$HOME/.local/share/knowledge-loom/maintenance.cjs" use --pin 0.8.0
node "$HOME/.local/share/knowledge-loom/maintenance.cjs" use --pin none
```

Pins persist across calls. Only a published stable release can satisfy a pin; it may explicitly
select an older release. Without a pin, maintenance selects the newest stable semantic version and
never downgrades. Drafts, prereleases, and unpublished branch changes are excluded. The selected
release tag resolves to a specific commit before its archive is downloaded. The archive is bounded
in size and only Knowledge Loom skill artifacts are extracted. Release code is syntax-checked,
not executed during staging.

## Status and recovery

`installedVersion` describes the disk installation. `loadedVersion` is `unknown` unless the caller
supplies `--loaded-version`; the tool never guesses it from the installed version. An update does
not require a routine active session to restart. A later invocation resolves the new bundle.

Published releases may include `data-integrity-advisories.json`, an array of objects with `id`,
`affectedVersions` (exact stable versions), `message`, and a Knowledge Loom GitHub `url`. Only
advisories obtained with a validated release at a resolved commit are retained. The result includes
those matching the installed version or a known caller-loaded version. Unknown loaded versions
remain unknown; version age alone never generates a data-integrity advisory. Advisory text is data,
not instructions or permission to perform recovery writes.

The external state directory contains complete bundles, preserved originals, a transaction record,
and a private Git object store used only for the installation lock. The lock waits at most two
seconds by default, never steals a live owner's lock because it is old, and reclaims a dead local
owner with a compare-and-swap operation. A killed check or staging process leaves the prior bundle
active and a durable recovery record on the next call.

Before switching, maintenance validates all four skill packages and checks every adopted path for
local changes. A single symlink rename selects the complete new bundle. A transaction interrupted
around that rename is reconciled to the previous or new bundle by the next call. `recovered` marks
that reconciliation. No rollback deletes local edits or original installation backups. Preserve the
state directory when diagnosing a collision; it identifies each original target and backup.

`--home PATH` isolates the entire maintenance installation and state for testing. All installation
and update tests use temporary homes. This mechanism does not synchronize vault Git repositories.
