# Releasing

Releases run from GitHub Actions (`.github/workflows/release.yml`), started by hand. For a new tag the job bumps `package.json` to the tag's version if needed, re-pins the CDN snippets (version + SRI hash), runs the full gate, commits `Release vX.Y.Z` as `github-actions[bot]` to the branch, tags that commit, publishes to npm with provenance (trusted publishing, no token) and creates the GitHub Release with generated notes.

## One-time setup (owner)

On npmjs.com: package `webmcp-tour` → Settings → Trusted publishing → GitHub Actions:

- Organization or user: `fboldo`
- Repository: `webmcp-tour`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allow direct `npm publish`.

Because the workflow is started with `workflow_dispatch`, npm checks the workflow filename (`release.yml`) as above.

Fields are case-sensitive and npm does not validate them when saving. A new configuration must finish its first successful publish within 2 days, or it expires. See <https://docs.npmjs.com/trusted-publishers>.

## Releasing

1. Merge what you want to ship into `main`.
2. Actions → Release → Run workflow: `tag` = `vX.Y.Z`, `ref` = `main`, `dry_run` off. (Tick `dry_run` first to see the bump diff in the job summary without committing, tagging or publishing.)

No manual version bump or `pnpm release:prepare` PR is needed. `pnpm release:prepare` still works locally if you want to preview the pinned snippets.

The job pushes the release commit straight to `ref`. If `main` is protected, allow `github-actions[bot]` to bypass the pull-request requirement for it (branch protection or ruleset bypass list); otherwise the job fails before tagging or publishing, with a message saying so.

## Retrying

If a run fails after the tag was pushed (for example npm publish), run it again with the same tag. An existing tag is never moved or recreated: the job checks the tag out, runs the same gate, then publishes to npm only if that version is not on the registry and creates the GitHub Release only if it does not exist. If both are done it ends with "Nothing to do". To change the contents of a released version, release a new version.

The job fails if the tag differs from `v` + the `package.json` version, or if the README hash differs from the freshly built `dist/webmcp-tour.js`.

## Keeping the README version current

`pnpm check` (and so CI) runs `pnpm pins`, which fails if any pinned CDN snippet in `README.md`, `site/content` or `skills/` names another version than `package.json`, or lacks an `integrity` attribute. The release workflow bumps `package.json` and re-pins the snippets in the same release commit, so the README on `main` and on npm always shows the version just released. The hash itself is checked at release time, against the freshly built file.
