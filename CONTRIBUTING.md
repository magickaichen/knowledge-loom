# Contributing

Keep Knowledge Loom agent-neutral and keep every fixture fictional. Open an issue before changing
the contract schema or protocol semantics so compatibility and migration behavior are explicit.

## Development

Install Node.js 20+ and npm, then run:

```bash
npm ci
npm run build
npm run validate:npx
```

Edit the top-level protocol, schema, and strict TypeScript modules rather than their generated copies
inside `skills/*/references` and `skills/*/scripts`. `npm run typecheck` checks the source without
emitting files; `npm run build` bundles it into the self-contained JavaScript runners that users
install. Include tests for behavioral or safety changes. Never place credentials or real personal,
company, health, family, or private-vault content in issues, fixtures, logs, or pull requests.

## Distribution metadata

Keep the plugin at the repository root so Codex, Claude Code, and `npx skills` all package the same
`skills/` directory. The Codex marketplace therefore uses the remote `source: "url"` form for a
repository-root plugin, as documented in OpenAI's
[marketplace metadata](https://developers.openai.com/plugins/build/plugins#marketplace-metadata)
reference. The `plugin-creator` scaffold's `./plugins/<name>` local path applies when a marketplace
contains nested plugin directories; do not introduce that duplicate layout here.

Keep `package.json`, both plugin manifests, and the Claude marketplace on the same version,
repository URL, and license. `tests/distribution.test.mjs` enforces those required copies.

## Release

1. Add the release notes under `## vX.Y.Z` at the top of `CHANGELOG.md`.
2. Update the version in `package.json`, both plugin manifests, and the Claude marketplace.
3. Run `npm run validate:npx` and merge the change into `main`.
4. Create and push an annotated tag that matches the package version:

   ```bash
   git tag -a v0.1.1 -m "v0.1.1"
   git push origin v0.1.1
   ```

The release workflow rejects a tag without matching package versions and changelog notes, runs the
local validation suite, builds a versioned Claude Desktop ZIP, and publishes the curated notes.
