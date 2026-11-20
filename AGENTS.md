# AGENTS.md

Guidance for coding agents working in this repository. People should start with [README.md](README.md) and the [docs](https://fboldo.github.io/webmcp-tour/).

## What this is

`webmcp-tour` is a zero-dependency TypeScript browser library. It registers four WebMCP tools (`tour_show_step`, `tour_list_targets`, `tour_dismiss`, `tour_wait_for_interaction`) so an AI agent can highlight a control on the page, explain it in a card, and wait while the user acts. It ships as ESM (`webmcp-tour`) and as a script-tag IIFE (`dist/webmcp-tour.js`) that registers a default tour on load.

## Layout

| Path | What |
|---|---|
| `src/engine/resolver/` | Finds elements by declared target, selector or visible text; accessible names, visibility, outline, context |
| `src/engine/overlay/`, `src/engine/theme/` | Spotlight and card in a shadow root (top layer, anchor positioning, fixed fallback), default styles |
| `src/tour/` | `createTour()`: targets, pages, resume after navigation, waits, labels |
| `src/tools/` | Tool definitions (agent-facing descriptions) and `registerAsWebMcpTool()` |
| `src/adapters/` | `getModelContext()`: native `document.modelContext` or nothing |
| `src/iife.ts` | Script-tag entry: `data-config`, `data-manual`, `data-no-global` |
| `test/` | Vitest browser mode, Chromium and Firefox |
| `demo/`, `examples/` | Try-it page with an in-page agent, and runnable examples |
| `site/` | Docs site source (`site/content/*.md`) and build; also produces `llms.txt` |
| `skills/webmcp-tour/` | Agent Skill for adding the library to an app |
| `scripts/` | Size budget, SRI, release prep, screenshots and the README GIF |

## Commands

Use pnpm through Corepack (`corepack pnpm …` if `pnpm` is not on your path). Node ≥ 22.18.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox   # once
pnpm check        # typecheck, build, tests (both browsers), size budgets, CDN pins — run before every PR
pnpm docs:build   # docs site + llms.txt; run when you touch site/, README or the public API
pnpm demo         # http://127.0.0.1:4173/demo/
```

`pnpm check` must pass on a clean clone. CI runs the same command plus `pnpm docs:build`.

## Rules

- **No runtime dependencies.** Dev dependencies only.
- **Tools never throw.** Every tool returns an envelope: `{ ok: true, … }` or `{ ok: false, error, … }` (with `isError: true`). The engine throws only on programmer errors (bad options).
- **Privacy is part of the contract.** Results sent to agents contain visible content only: never field values, attribute values, hidden or `data-tour-exclude`d content, or text typed into editable elements. Selectors that could probe hidden state (`:has()`, attribute-value operators) are refused. Add a test for any new data path that reaches an agent.
- **The user acts, the library points.** Nothing clicks, types, submits or navigates without a user gesture. Navigation happens only on the user's **Go**.
- **No DOM work at import.** The root entry must stay SSR-safe; guard `document`/`window` use.
- **Size budgets** (gzip, minified): engine-only ≤ 17 KB, IIFE ≤ 18 KB, enforced by `pnpm size`. Don't raise a budget without saying so in the PR.
- **Agent-facing text is product surface.** Tool descriptions in `src/tools/definitions.ts` are kept short (Playwright MCP prepends ~190 characters) and under the length test; result notes are read by small models too. Change them deliberately.
- **Docs follow the code.** If you change an option, an envelope, a status or a default label, update `README.md`, `site/content/`, `skills/webmcp-tour/` and the tests in the same PR.
- **Tests run in real browsers.** Behaviour that depends on layout, focus or events gets a browser test in both Chromium and Firefox. Write the failing test first for bug fixes. No retries or loosened assertions to hide flakiness: find the cause.
- **Don't edit pinned CDN snippets by hand.** Version and SRI hash are rewritten by `pnpm release:prepare`; `pnpm check` fails if a snippet names another version than `package.json`.

## Pull requests

- One topic per PR, branched from `main`. Keep diffs minimal.
- Paste the `pnpm check` (and `pnpm docs:build`, if relevant) result in the PR body.
- Never commit secrets or API keys, or local notes and scratch files.
- Releases are cut by the maintainer from GitHub Actions; see [RELEASING.md](RELEASING.md). Don't bump the version or publish from a PR.
