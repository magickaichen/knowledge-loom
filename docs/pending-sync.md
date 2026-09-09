# Publish committed vault changes after remote recovery

`sync` publishes audited committed knowledge for `sync.mode: git-remote-push`, using the remote and
branch already authorized by `sync.inbound`. Provider lifecycle hooks and backup adapters remain
external. The command does not create a local knowledge commit before synchronization.

```sh
knowledge-loom sync /path/to/vault --json
knowledge-loom sync /path/to/vault --status --json
```

When the result is `needs-reconciliation`, review its three-way evidence and prepare a local
resolution file. This review is required for clean text as well as textual conflicts. The complete
agent procedure and resolution format are in [Pending synchronization](../references/synchronization.md).

```sh
knowledge-loom sync /path/to/vault --resolution /path/to/resolution.json --json
```

Use the same `--registry` and `--state-dir` values across access and sync. Operational records and
isolated candidates stay outside the vault and Git directory. They may contain private note text;
keep them in a user-controlled local directory. Retained candidates are not deleted automatically.

A failed push leaves local reads, authorized writes, and focused commits available. Authentication
and transport errors remain pending. Non-fast-forward rejection immediately fetches current remote
evidence and prepares isolated work; it does not start a merge in the ordinary checkout. Each sync
invocation attempts at most one push, including after applying an audited resolution.

Check `status`, `published_revision`, and the independent lifecycle fields. `backed_up: not-run`
means the caller must run and verify its declared backup adapter. A later local commit does not
inherit an earlier publication's synchronized status.
