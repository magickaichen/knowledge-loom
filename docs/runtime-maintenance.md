# Codex and Claude Code maintenance routing

The shared-skills route gives both runtimes one installation owner and one device-local set of
release and vault observations. Setup installs an external command and user instructions independently
of the adopted skill release. Actual access calls that command, including access later in a session.
Session startup only exposes the route; it performs no release lookup or vault fetch.

## Preview and configure

Build from a trusted checkout with `npm ci && npm run build:maintenance`. Start with:

```sh
node dist/maintenance.cjs setup --source /path/to/matching-source
```

Read the runtime versions, installation paths, duplicates, plugin ownership, and proposed configuration.
The source must match all existing ordinary skills, including their local file modes and extra files.
For an old installation, provide its matching release checkout; the external command comes from the
new build and works even when the old skill has no maintenance instructions. For a fresh installation,
setup creates the four skills from the supplied source. Prerelease and uncommitted development
sources are for isolated testing; use trusted published sources for real installation.

Apply the preview with `--apply`. When duplicates exist, explicitly add `--migrate`:

```sh
node dist/maintenance.cjs setup --source /path/to/matching-source --apply --migrate
```

Setup adopts `.agents/skills`, links Claude's four skill paths to that owner, and migrates existing
Codex-specific ordinary copies to the same owner. Codex discovers shared skills directly. Independent
ordinary duplicates must match the source before migration. Local changes stop setup before adoption.
Existing shared aliases are already one owner and need no duplicate migration.

For Claude, `--migrate` disables only enabled `knowledge-loom@…` entries in user settings; its plugin
cache and installation-manager records stay intact for recovery. Other plugins and settings remain.
Codex native-plugin configuration requires explicit migration through its plugin manager before
setup can proceed. Plugin-linked ordinary skills require owner migration too; setup never edits a
versioned plugin cache. Project-scoped, managed enterprise, and custom runtime-home installations
are outside automatic user-home discovery: remove/disable their Knowledge Loom owner explicitly
before adopting this route. Do not enable an additional owner afterward.

Setup preserves original configuration text in `~/.local/share/knowledge-loom/runtime-backups/`.
It appends a bounded managed block to user `AGENTS.md` / `CLAUDE.md` and a SessionStart command to
Codex `hooks.json` / Claude `settings.json`. Claude also receives a `Read|Skill` PreToolUse hook.
Unrelated instruction text is preserved byte for byte;
JSON retains unrelated values. Configuration symlinks require explicit owner migration. Repeating
setup is idempotent. Previously bootstrapped runtime-specific targets remain tracked by the same
maintenance owner when shared targets are added. A busy coordinator stops configuration; retry
after its writer finishes. Directory symlinks escaping the selected home are rejected, and a
configuration change observed during setup stops replacement so the new text is preserved. Inspect the preview again after any local change.

`configured` means the installed external command passed its local hook self-check. It does **not**
mean an active runtime has loaded the new configuration. Start or resume a runtime as supported by
that runtime, approve hook trust if required, and verify an actual route call before treating the
cooperative route as active. Managed policy, disabled hooks, or an already loaded instruction snapshot
can prevent activation. Setup does not override them or force an active session to restart.

## Actual access and publication

User instructions and startup context direct both runtimes to call the external command before
retrieval. Claude's native `Read` tool also runs maintenance through PreToolUse when its canonical
file belongs to the vault selected by the hook's project cwd. Unrelated reads and symlinks outside
that vault do nothing. The native `Skill` tool checks the four exact Knowledge Loom skill names,
including standalone invocation without a selected vault. This Skill hook checks releases only;
the explicit route handles vault selection and access after the skill resolves its arguments.
The hook returns separate release/vault
state and leaves normal runtime permission checks intact. It denies a failed maintenance operation
or busy vault writer. Verified advisories remain in the returned context; the explicit route handles
operation assessment before vault mutation. Contract-authorized local reads remain available. Shell reads and namespaced plugin skills still require the explicit cooperative route.
The two explicit access branches are:

```sh
node "$HOME/.local/share/knowledge-loom/maintenance.cjs" route --runtime codex --mode skill
node "$HOME/.local/share/knowledge-loom/maintenance.cjs" route --runtime claude --mode project
```

`skill` checks releases even for standalone init/audit/focus use without a selected vault. `project`
uses only an ancestor contract or registered project association; no applicable vault means no
maintenance request. Pass `--selector` only for an explicitly selected vault and `--registry` for a
supplied registry. Selection and governing authority validation precede maintenance work. The result
reports release and vault states separately. Reread the resulting contract and instruction roots
before retrieval, and resolve the installed skill's canonical path again.

Repeat the route at each actual access, including later accesses in a continuing session. The shared
coordinator performs at most one due release observation per elapsed seven days and a vault check
per elapsed 24 hours. Failed observations retain their own bounded backoff. Ordinary conversation,
SessionStart, and unrelated hook events make no Knowledge Loom maintenance network calls. Runtime
telemetry, model requests, and plugin-manager traffic are separate from maintenance.

For `sync.mode: git-remote-push`, after an authorized audited focused commit, call the route with
`--operation sync`. A rejected push reaches immediate reconciliation despite today's access cache.
For evidence requiring judgment, the **active authorized runtime** reads the common ancestor and both
sides under [the synchronization rules](../references/synchronization.md). Submit an evidence-backed
resolution with `--operation sync --resolution PATH`. No background agent or model is launched.
Continue declared backup adapters and report their independent result. Lifecycle-hook providers
remain external.

## Status, recovery, and boundaries

Release `installedVersion` is the disk version. `loadedVersion` remains `unknown` unless the session
can substantiate `--loaded-version VERSION`; an on-disk version is not loaded-version evidence.
Routine updates do not require restart. When a verified advisory exists, the route returns
`advisory-assessment-required` **before** access/integration or publication. The active authorized
runtime assesses whether this operation is affected. Copy the returned `assessmentRequest` to a
JSON file and add `proceed` and an evidence-backed `rationale`; retry with `--advisory-assessment PATH`.
Use `proceed: true` only for an unaffected operation. A false decision returns `advisory-paused`.
The decision is bound to the canonical vault, operation, installed/loaded versions, and digest of
the exact advisory evidence. A different operation or changed evidence requires another assessment.
Local contract-authorized reads remain available while the mutating route is paused. A version gap
alone is not an advisory.

`runtime-status --home PATH` reports route configuration and installed state without a release lookup
or vault fetch. `automaticMaintenance: false` means actual runtime activation still needs verification;
a caller-supplied runtime name is not evidence of model-driven execution.

Remote failure leaves local reads, authorized edits, and commits available, with durable pending sync.
Use the same publication route after the bounded retry interval, or the explicit resolution path when
there is reconciliation evidence. [Pending sync](pending-sync.md) describes isolated evidence and
recovery. [Release maintenance](release-maintenance.md) describes pins, collision recovery, and atomic
bundle updates. Preserve backups and operational state when diagnosing a failure. Re-running setup
can complete missing links/configuration after an interruption; it never deletes a conflicting backup.
Restore original files only after inspecting current changes and disabling the route, using the
preserved original text/skill directories. Never overwrite local edits with a blanket restore.

This is a cooperative **external command boundary**, not universal read interception. Arbitrary shell
reads, direct legacy CLI calls, disabled hooks, hosted tools, and opt-out tool paths can bypass it.
Read-only `probe`, `resolve`, and `audit` remain read-only. User instructions are the persistent route;
SessionStart is a redundant reminder; Claude PreToolUse covers only the native access paths above. No automatic hot-reload or
loaded-skill-version introspection is claimed. See the [runtime verification record](runtime-verification.md)
for exercised versions, capabilities, and untested paths.

All installer and runtime experiments support `--home PATH`. In tests, also set `HOME`, `CODEX_HOME`,
and `CLAUDE_CONFIG_DIR` to that temporary home so runtime configuration, discovery, and observations
remain isolated. Use synthetic vaults and a temporary remote; do not test migration against a private vault.

The runtime **tool environment** must include Git on `PATH`; a logged-in runtime control process
can have a different environment from its shell tools. `Git executable unavailable on the runtime
tool PATH` means to restore that dependency, not remove a vault lock. For isolated Codex tests with
`shell_environment_policy.inherit="none"`, explicitly set a tool PATH containing Git. Keep normal
sandbox permissions; add only the test-owned vault and its Git metadata when write access is needed.
