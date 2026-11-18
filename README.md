# webmcp-tour

Agent-callable guided-tour tools for WebMCP: an agent answering "how do I change X?" highlights the control and explains it, while the user clicks it themselves.

Status: pre-release, under construction.

## Playwright MCP

Playwright MCP reaches WebMCP tools only in Chrome launched with the feature on. In its config:

```json
{ "browser": { "launchOptions": { "args": ["--enable-features=WebMCP"] } } }
```

The tools show up as `webmcp_<name>` (for example `webmcp_tour_show_step`) after a page snapshot. The snapshot lists the raw names (`tour_show_step`); call the prefixed ones. Each call is capped at 30 s, so a long `tour_wait_for_interaction` ends early: call it again or ask the user.

## Examples

Three runnable apps in [`examples/`](examples): a script tag, a Vite bundle, and an engine embed with your own tool. Start with `pnpm example:script-tag`.

## Development

Uses **pnpm** (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up) and Node ≥ 22.18.

```sh
pnpm install
pnpm exec playwright install chromium   # once: Vitest runs tests in real Chromium
pnpm typecheck
pnpm build       # tsup → dist/index.js, dist/auto.js (ESM), dist/webmcp-tour.js (IIFE, sets window.webmcpTour)
pnpm test        # Vitest browser mode (Chromium + Firefox); the IIFE test needs the build
pnpm size        # gzip budget gate: engine-only ≤ 12 KB; full (/auto, script tag) ≤ 15 KB each
pnpm check       # all of the above, as CI runs it
pnpm demo        # build, then serve http://127.0.0.1:4173/demo/ (PORT overrides); see demo/README.md
```

CI: the GitHub Actions workflow is manual-only for now; run `pnpm check` locally before merging.

TypeScript is pinned to 6.x: tsup's `.d.ts` build needs the TypeScript compiler API, which TypeScript 7 no longer ships.

## License

MIT © Filipe Boldo
