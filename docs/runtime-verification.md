# Runtime maintenance verification

This record covers [issue #47](https://github.com/magickaichen/knowledge-loom/issues/47), based on
[the approved public-command boundary in #43](https://github.com/magickaichen/knowledge-loom/issues/43).
The implementation branch started at `origin/main` commit `9d111ea` after fetching the merged
release-maintenance work. All mutating experiments use temporary homes and synthetic fixture vaults.

## Installed runtime inspection

On 2026-09-09, local `--version` commands reported `codex-cli 0.144.3` and Claude Code `2.1.236`.
`codex features list` reported `hooks` as stable and enabled in the inspected real configuration.
The existing ordinary skills were in `.agents/skills`; Claude's four ordinary entries linked there.
Claude also had an enabled Knowledge Loom plugin. The proposed pilot owner is shared skills, with
explicit disablement of that plugin and preservation of its cache. This was **inspection and preview**;
no real skill installation, runtime configuration, or private vault was changed.
The final read-only setup preview confirmed zero independent ordinary duplicates, an enabled Claude
plugin owner, and symlinked user instruction files in both runtimes. Those instruction symlinks are
an explicit owner-migration prerequisite; the installer will not replace them or edit their targets.
The preview is not an apply-ready promise for the real home. A matching historical source bundle
must also be supplied for actual adoption.

[Codex hook documentation](https://learn.chatgpt.com/docs/hooks) describes user hooks and tool-path
exceptions. [Claude hook documentation](https://code.claude.com/docs/en/hooks) describes SessionStart
context delivery. The adapter uses startup context and user instruction files in both runtimes, plus native
`Read|Skill` PreToolUse in Claude. It does not
infer that a particular running session accepted hooks, supports hot reload, or exposes loaded skill
versions from those documents. Both the configuration preview and status keep activation unverified.

## Deterministic public-command tests

`tests/runtime.test.ts` exercises the built external executable for preview/setup/migration and the
public runtime command dispatcher for controlled release-source/time tests. Fixtures contain only
synthetic content. The dispatcher uses the same implementation as the installed executable.

| Scenario | Observable evidence |
| --- | --- |
| Setup preview | No home mutation; proposed user instruction/configuration text returned |
| Setup twice | Same JSON settings and one route; unrelated model, hooks and guidance preserved |
| Duplicate ordinary/plugin owners | Apply requires migration; local customization blocks adoption; original ordinary copy backed up; only Knowledge Loom plugin disabled |
| Existing bootstrap | Shared targets become tracked links without breaking the old maintained targets |
| Busy installation owner / escaped home | Setup refuses to configure while maintenance is busy or directory symlinks escape the selected home |
| Integrity advisory | Route pauses before vault operations; active-runtime assessment is bound to operation and exact evidence |
| Old skill | Adopted 0.7.0 synthetic skill has no maintenance instructions; external access still checks releases and vault |
| Both runtimes / continuing access | One shared release lookup; cached daily observation; later due call integrates a real remote commit; elapsed weekly boundary checks again |
| Associated project | Registry association reaches the same canonical checkout |
| Active local edit | Successful remote observation remains behind; unfinished local text preserved |
| Offline / local work / recovery | Failed access remains unavailable; local commit remains usable; pending publication survives and later synchronizes |
| Push race | Fresh cache does not hide rejected push; isolated evidence returns; explicit synthetic evidence resolution preserves both contributions |
| Ordinary conversation / startup | Unrelated events do nothing; SessionStart only returns instructions; no maintenance state or network calls |

Existing `maintenance`, `access`, and `sync` suites retain concurrent observation, atomic replacement,
interruption, bounded retries, authority revalidation, and adversarial reconciliation coverage. These
are deterministic tests, not evidence that a hosted model followed instructions or resolved facts.

## Real runtime smoke and limits

Run `npm run build` followed by `node --import tsx scripts/runtime-smoke.ts`. The script creates a
fresh temporary home, copies the synthetic fixture vault, configures routing, and launches the actual
installed Codex and Claude executables from that vault. It retains logs in the temporary home and
does not copy login state or configuration from the real home. Inspect tool calls, not just exit status.

An additional ordinary-conversation launch in an isolated home confirmed that Codex stored the
external routing instructions in its session transcript. The first network-restricted launch failed
DNS lookup; a repeat with network access reached the model endpoint and received HTTP 401.
Claude returned `Not logged in` before model execution. These are authentication limits of the
isolated homes, not a successful end-to-end hosted-model test.

An explicitly authorized authenticated follow-up used disposable homes, synthetic notes, a local bare
remote, and exact command/read allowlists. Codex initially failed with `cannot create vault mutation
lock`; instrumentation isolated `spawnSync git ENOENT`. The test's `inherit="none"` policy had omitted
Git from the tool PATH. Giving the tool environment an explicit system PATH made the original route
succeed without disabling the workspace sandbox. The lock error now identifies missing Git directly.

Claude initially rejected the textual maintenance prerequisite and read the note directly. The added
native PreToolUse hook closes that observed `Read` path independently of model cooperation. After the
fix, both processes remained alive through ordinary conversation and subsequent access:

| Authenticated scenario | Observed result |
| --- | --- |
| Ordinary conversation in both runtimes | No maintenance route; no release `lastCheck` |
| Codex associated project | Successful route and retrieval of synthetic `CEDAR-ONE` |
| Claude native Read in associated project | Read tool invoked; shared observation timestamp unchanged |
| Later Codex access in the same process | Route integrated a remote commit and retrieved `CEDAR-TWO` |
| Later Claude native Read in the same process | Native Read integrated the next remote commit and retrieved `CEDAR-THREE` |

Daily due state was advanced by aging only the synthetic observation timestamp; this was not a
24-hour wall-clock wait. Codex prompts named the permitted route explicitly. Claude prompts requested
native Read and relied on the configured hook. The bare remote, checkout content, tool events, and
observation timestamps were inspected; correct response text alone was not the pass criterion.
Temporary authentication copies were removed after terminating the runtime processes. Existing real
installation/configuration ownership was unchanged. Managed Claude startup hooks also ran in the
disposable home, so this was not a pristine unmanaged runtime test.

Local evidence from this run is retained under `/private/tmp/kl-safe-live-je1hxmh3/` (`results.json`,
`codex-out.jsonl`, `claude-out.jsonl`, and `guard-log.jsonl`); these machine-local files are not distributed.
The repeatable deterministic coverage is in `tests/runtime.test.ts`, including native reads,
standalone Skill dispatch, unrelated/escaped paths, malformed authority, busy-writer local reads,
and missing tool PATH.

**Untested:** authenticated model-driven standalone skill invocation, Codex startup-hook acceptance
independently of user instructions, automatic hot reload, and semantic judgment by a hosted runtime.
No automatic maintenance activation is claimed for the user's existing sessions. Deterministic
standalone dispatch coverage does not establish model-driven invocation.

Arbitrary shell reads, opt-out tools, custom/enterprise/project installation scopes, Windows,
Claude Desktop, and native plugin update ownership are outside this adapter's tested boundary.
