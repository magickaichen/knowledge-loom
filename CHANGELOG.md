# Changelog

## v0.7.0

Durable vault notes and navigation pointers now have an agent-readable writing gate with optional
support for Matt Pocock's unmodified `writing-for-agents` skill.

### Added

- Added protocol-owned checks for one source of truth, co-located rationale and provenance, stable
  terminology, conditional navigation pointers, lifecycle state, and duplicate pruning.
- Added optional `writing-for-agents` invocation after write authorization when Distill will create
  or restructure an agent-consumed note or navigation pointer.
- Added a self-contained built-in authoring fallback when the companion skill is unavailable.
- Added hermetic Codex and Claude behavior coverage for companion availability, retrieval-only
  work, and authority boundaries.

### Compatibility and safety

- Kept `writing-for-agents` optional rather than making it an installation prerequisite.
- Kept authority, evidence, privacy, subject isolation, validation, Git, sync, backup, and lifecycle
  behavior under the Knowledge Vault Protocol.
- Preserved contract schema version 1 and all existing installation routes.

### Maintenance

- Added agent-neutral contributor guidance for issue tracking, triage labels, and domain docs.
- Updated GitHub Actions to `actions/setup-node@v7`.

## v0.6.0

All handwritten contributor code now uses strict TypeScript while every installation route
continues to ship one self-contained JavaScript runner.

### Changed

- Migrated deterministic parsing, resolution, initialization, audit, content-check, and CLI source
  modules to strict TypeScript.
- Migrated build, installation, release, validation, behavior-evaluation, and test code to strict
  TypeScript.
- Added explicit internal types for contracts, registries, findings, vaults, CLI options, and
  content-check results while keeping YAML and JSON inputs runtime-validated from `unknown`.
- Added all handwritten code to the standard TypeScript validation path on Node.js 20, 22, and 24.

### Compatibility

- Preserved the protocol, contract schema, CLI commands, output, exit statuses, and Node.js 20+
  requirement.
- Kept installed skills independent of TypeScript, `tsx`, `node_modules`, and repository checkouts
  by generating the same self-contained `.mjs` distribution boundary.

## v0.5.0

Applicable vaults now participate automatically in substantive project work and preserve durable
knowledge without requiring users to know a skill name.

### Added

- Added a successful no-op `probe` command so agents can test vault applicability before asking the
  user to choose one.
- Added route-first retrieval for current attention, governance, lifecycle, and protected-data
  evidence before general relevance ranking.
- Added automatic use guidance for Codex and Claude integrations, including post-task durable
  capture and current-focus maintenance.

### Changed

- Defaulted newly initialized and conservatively adopted vaults to
  `proactive-durable-capture` writes and `maintain-after-material-change` current-state upkeep.
- Kept `explicit-only` available as an explicit contract override; existing vault contracts retain
  their declared policies.

### Safety

- Projects without an ancestor vault contract or registered project association remain a silent
  no-op instead of triggering vault selection.
- Automatic use still honors deterministic vault and subject selection, privacy boundaries,
  preview requirements, lifecycle actions, and backup declarations.

## v0.4.0

One audit can now enforce both portable vault structure and local content rules.

### Added

- Added optional `content_checks.adapter` declarations to vault contracts and trusted executable
  mappings to the local user registry.
- Merged declared checker results into the existing `knowledge-loom audit` report with observable
  adapter source, validation date, file path, and line information.
- Documented one checker result interface for vault-specific rules without adding a second audit or
  validation command.

### Safety

- Kept executable commands and private paths outside vault contracts and reusable skill packages.
- Started checkers directly without a shell and bounded their runtime and output.
- Failed closed when a checker is missing, invalid, timed out, inconsistent, or requested by an
  invalid contract.
- Kept compatibility requirements in skill bodies so every package uses portable skill
  frontmatter.

## v0.3.0

Projects can now select their registered vault automatically.

### Added

- Added preview-first `associate` CLI support for binding a canonical project directory to a
  registered vault ID.
- Added deterministic project-aware resolution: explicit selectors still win, a vault's own
  nearest contract stays authoritative, and the nearest nested project association wins before the
  single-vault fallback.
- Added direct invocation examples for standalone and plugin installs in Codex and Claude Code.

### Safety

- Kept project associations in the local user registry instead of modifying project repositories.
- Invalid or conflicting associations fail closed and do not expand a vault's declared authority.

## v0.2.0

The deterministic tooling now runs on JavaScript instead of Python.

### Changed

- Replaced the source package, CLI, builders, installer, tests, and CI with Node.js modules.
- Bundled the YAML parser into each skill's single `knowledge-loom.mjs` runner, so installed skills
  do not run `npm install`, depend on a repository checkout, or fetch code on first use.
- Declared the Node.js 20+ runtime requirement in every command-capable skill while keeping the
  instruction-only Claude Desktop ZIP free of executable runtime requirements.

### Compatibility

- Preserved the `init`, `audit`, `resolve`, and `register` CLI commands, contract schema, exit
  statuses, safety boundaries, and agent-neutral installation routes.

## v0.1.1

Initial public release.

### Added

- Four agent-neutral skills for initializing, auditing, using, and maintaining focus in governed
  Markdown knowledge vaults.
- One runtime-neutral protocol for vault selection, subject isolation, write authorization, and
  lifecycle reporting.
- Installation through `npx skills`, Claude Code and Codex plugins, and a Claude Desktop ZIP.
- Deterministic Python commands for vault initialization, registration, resolution, and audit.
- CI validation for generated skill packages, fictional fixtures, behavior cases, and distribution
  artifacts.

### Safety

- Vaults, subjects, and focus views must be selected explicitly instead of inferred by topic.
- Durable writes require the vault's declared authorization and lifecycle steps.
- Missing information remains unknown, and one subject's facts never transfer to another.
