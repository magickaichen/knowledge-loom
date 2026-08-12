# Changelog

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
