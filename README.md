# webmcp-tour

Agent-callable guided-tour tools for WebMCP: an agent answering "how do I change X?" highlights the control and explains it, while the user clicks it themselves.

Status: pre-release, under construction.

## Development

Uses **pnpm** (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up) and Node ≥ 22.18.

```sh
pnpm install
pnpm exec playwright install chromium   # once: Vitest runs tests in real Chromium
pnpm typecheck
pnpm test        # Vitest browser mode, Playwright provider, headless Chromium
pnpm build       # tsup → dist/index.js, dist/auto.js (ESM), dist/webmcp-tour.js (IIFE, global webmcpTour)
pnpm size        # gzip budget gate: engine ESM ≤ 10 KB
pnpm check       # all of the above, as CI runs it
```

CI: the GitHub Actions workflow is manual-only for now; run `pnpm check` locally before merging.

TypeScript is pinned to 6.x: tsup's `.d.ts` build needs the TypeScript compiler API, which TypeScript 7 no longer ships.

## License

MIT © Filipe Boldo
