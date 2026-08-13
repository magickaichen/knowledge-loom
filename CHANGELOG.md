# Changelog

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
