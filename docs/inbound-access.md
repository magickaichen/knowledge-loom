# Daily inbound access

`access` prepares an authorized Git vault for retrieval. It observes the configured remote when
due and fast-forwards only when the checkout is safe to update. It does not install runtime hooks
or upgrade skills.

## Enable access

Use a vault at its Git checkout root whose current branch tracks the intended remote and branch.
Read its contract and resolve conflicting prose policies before enabling inbound access.
Substitute the actual vault, remote, and branch:

```sh
npm run cli -- access /path/to/vault --enable-inbound --remote origin --branch main --json
npm run cli -- access /path/to/vault --enable-inbound --remote origin --branch main --apply --json
```

The first invocation previews the complete contract. The second applies it under the shared lock.
Review the diff, audit, and follow the existing commit/sync/backup lifecycle. Existing installations
and contracts retain their behavior until explicitly updated and enabled.

## Access and inspect

```sh
npm run cli -- access /path/to/vault --json
npm run cli -- access /path/to/vault --status --json
```

Omitting the selector selects only an ancestor or project-associated vault. For an explicit vault
request with no selector, use `resolve` first and pass its root. `probe`, `resolve`, and `audit`
remain read-only. See [Prepare inbound access](../references/protocol.md#prepare-inbound-access)
for the authoritative scheduling and failure rules.

Results have `schema_version: 1`, a canonical `root`, and `status`. `check`, when present, is
`performed`, `cached`, `failed`, `backoff`, or `read-only`. Observations separate `attempted_at`,
`checked_at`, `remote_revision`, and the last recorded integration/local revision. Times are Unix
milliseconds. `checked_at` records a successful fetch, not proof of integrated knowledge. A
`state_file` identifies the local recovery record when available.

| Status | Meaning and next action |
| --- | --- |
| `not-applicable` | No automatically applicable vault; continue the primary task. |
| `not-enabled` | No inbound authorization; ordinary local retrieval remains available. |
| `unverified` | Read-only status has no successful observation. |
| `current` | HEAD equals the observed commit; respect the observation's age. |
| `integrated` | A fast-forward completed; reload authority and relevant notes. |
| `ahead` | Local commits extend the observed remote history; follow the declared sync lifecycle. |
| `behind` | Integration is deferred; finish local work or the active Git operation. |
| `diverged` | Both histories contain contributions; reconcile separately. |
| `recovery-required` | Upstream was rewritten; inspect history and reconcile explicitly. |
| `busy` | Another cooperating operation owns the lock; retry after it finishes. |
| `unavailable` | Inspect the reason while retaining local work. |

Degraded access returns exit 0 with a status so the caller can continue authorized local work.
Invalid arguments, invalid contracts, and escaping governing/state paths return exit 2; resolve
those errors before relying on retrieval. Plain text prints status/root; use JSON for detail.

The default state directory is `~/.local/state/knowledge-loom`. `--state-dir` selects another local
directory outside the vault and its Git directory. Each canonical checkout/local branch/remote
identity gets an observation; aliases of the same checkout share it. There is no background
schedule and no extra pre-write fetch.

## Coordinate a writer

```sh
npm run cli -- with-vault-lock /path/to/vault -- node /path/to/trusted-edit-script.js
```

The supplied executable runs from the vault root without constructing a shell command. It must
complete its writes before exiting; detached work is outside the lock contract. Use the wrapper
only for already-authorized edits. Contention returns exit 1; a started child returns its exit
code. Perform access before acquiring the writer lock; nested access contends with its own lock.

The lock uses Git compare-and-swap on `refs/knowledge-loom/mutation-lock`, shared by linked
worktrees. It records local owner/writer process IDs. Observation references under
`refs/knowledge-loom/observations/` preserve observed commits. Ordinary branch push does not
transfer these references; exclude them from mirror/all-reference transfers. Unrecognized or
foreign-host ownership requires explicit inspection rather than automatic deletion.

## Recover

Read `access --status --json` to inspect observation and local revision. Fix a missing remote or
mismatched upstream using the intended repository configuration, then retry. A dirty checkout can
integrate an already observed revision on a later access after its writes finish, without fetching.

After explicitly reconciling rewritten history, preserve the named observation file outside the
active state directory, then retry to establish a new observation. Do the same for a corrupt
record after checking why it was damaged. Never clear a live lock to bypass a writer. A killed
owner whose writer has also terminated is recovered automatically.

This access slice reports divergence and outbound work. Automatic semantic reconciliation,
weekly release maintenance, and runtime setup are separate implementation tasks.
