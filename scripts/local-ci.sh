#!/usr/bin/env bash
# Runs the CI checks for a pull request on this machine and records the result
# as a "local-ci" commit status. Stands in for GitHub Actions while the account
# has no Actions minutes.
#
#   scripts/local-ci.sh <pr-number>
set -euo pipefail

pr="${1:?usage: scripts/local-ci.sh <pr-number>}"
repo="fboldo/webmcp-tour"
sha=$(gh pr view "$pr" -R "$repo" --json headRefOid --jq .headRefOid)
dir=$(mktemp -d)
log="$dir/local-ci.log"
trap 'echo "log: $log"' EXIT

git clone -q "git@github.com:$repo.git" "$dir/w"
cd "$dir/w"
git fetch -q origin "pull/$pr/head"
git checkout -q "$sha"

status=success
{
  corepack pnpm install --frozen-lockfile &&
  corepack pnpm exec playwright install chromium &&
  corepack pnpm check
} >"$log" 2>&1 || status=failure

tail -20 "$log"
gh api -X POST "repos/$repo/statuses/$sha" \
  -f state="$status" -f context="local-ci" \
  -f description="pnpm check on $(uname -n), $(date -u +%FT%TZ)" >/dev/null
echo "local-ci: $status for $sha"
[ "$status" = success ]
