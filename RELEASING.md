# Releasing

Releases run from GitHub Actions (`.github/workflows/release.yml`) when a `vX.Y.Z` tag is pushed. It runs the full checks, verifies the tag and the README integrity hash, publishes to npm with provenance (trusted publishing, no token) and creates the GitHub Release with generated notes.

## One-time setup (owner)

On npmjs.com: package `webmcp-tour` → Settings → Trusted publishing → GitHub Actions:

- Organization or user: `fboldo`
- Repository: `webmcp-tour`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allow direct `npm publish`.

Fields are case-sensitive and npm does not validate them when saving. A new configuration must finish its first successful publish within 2 days, or it expires. See <https://docs.npmjs.com/trusted-publishers>.

## Each release

1. Bump `version` in `package.json`.
2. `pnpm release:prepare`: builds, then rewrites the pinned CDN snippets (version + SRI hash) in `README.md`, `site/content` and `skills`. Commit the result.
3. Open a PR and merge it once CI is green.
4. On `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The release job fails if the tag differs from `v` + the `package.json` version, or if the README hash differs from the hash of the freshly built `dist/webmcp-tour.js`. Run the workflow manually (Actions → Release → Run workflow) for a dry run: it runs everything except the publish (`npm publish --dry-run`) and the GitHub Release.
