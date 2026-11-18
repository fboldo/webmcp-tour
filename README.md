# webmcp-tour

Agent-callable guided-tour tools for WebMCP: an agent answering "how do I change X?" highlights the control and explains it, while the user clicks it themselves.

Status: pre-release, under construction.

## Playwright MCP

Playwright MCP reaches WebMCP tools only in Chrome launched with the feature on. In its config:

```json
{ "browser": { "launchOptions": { "args": ["--enable-features=WebMCP"] } } }
```

The tools show up as `webmcp_<name>` (for example `webmcp_tour_show_step`) after a page snapshot. The snapshot lists the raw names (`tour_show_step`); call the prefixed ones. Each call is capped at 30 s, so a long `tour_wait_for_interaction` ends early: call it again or ask the user.

## The step card

Each step shows a card with **Got it** next to the highlighted control. Pressing it dismisses the step and tells the agent: a pending `tour_wait_for_interaction` resolves `{ ok: true, status: "acknowledged" }` (the user read it and wants to continue), and `tour.on("dismiss")` reports `reason: "acknowledged"`. For a card that also scrolls to the control, focuses it and pulses the spotlight, opt in with **Take me there**:

```ts
createTour({ takeMeThere: true });
```

### Translations

Every user-facing string, and the card's aria labels, comes from `labels`. All keys are optional; these are the defaults:

```ts
createTour({
  labels: {
    gotIt: "Got it",
    takeMeThere: "Take me there",
    close: "Dismiss", // aria label of the × button
    attribution: "From your assistant", // visible, and the card's aria label
    goToPage: "Go to {page}", // {page} is the page title
    notNow: "Not now",
    otherPage: "Your assistant suggests going to {page}",
  },
});
```

The older `attribution` option still works (deprecated); `labels.attribution` wins when both are set. Labels are set as text, never parsed as HTML.

### Pages

Tell the tour about the app's pages and the agent can say "that control is on another page":

```ts
const tour = createTour({
  pages: [
    { id: "billing", url: "/billing", title: "Billing", description: "Plan and invoices." },
    { id: "security", url: "/security", title: "Security" },
  ],
  navigate: (url) => router.push(url), // default: location.assign
});
tour.definePage({ id: "team", url: "/team", title: "Team" }); // later, for dynamic apps
tour.defineTarget({ id: "two-factor", page: "security", label: "Set up two-factor", description: "Starts two-factor setup." });
```

- **Current page.** The first page whose `match` accepts `location`. `match` is optional: a string is a `location.pathname` prefix, a `RegExp` is tested against the pathname, a function gets `location`. Without it, the page's `url` path must equal `location.pathname`.
- **Targets on a page.** `defineTarget({ id, page, label, description })` needs no element: it only says where the control lives. On its own page the real element comes from `data-tour-id="two-factor"` (or `selector` / `element` on the definition). `data-tour-page="<page id>"` does the same in markup. A target whose page is not the current one is off-page: it is never highlighted.
- **`tour_list_targets`** returns the current `page`, the other `pages`, and every target; off-page ones carry `page: { id, title }` and `onThisPage: false`. It is registered whenever there are pages or targets, even if none is on the current page.
- **`tour_show_step`** takes a fifth locator, `{ page: "security" }`. For an off-page target, or an explicit `page`, it shows a card with no spotlight: the `otherPage` text, **Go to Security** and **Not now**. The envelope is `{ ok: false, error: "other_page", page }` for a target, and `{ ok: true, suggested: page }` for a `page` locator. A call never navigates; only the user's click on **Go** calls `navigate(url)`.
- **Waiting.** With a suggestion on screen, `tour_wait_for_interaction` resolves `{ status: "navigating" }` on **Go** and `{ status: "dismissed" }` on **Not now**, ×, or Escape.

Agents embedded in the page restart after a full page load, so after **Go** they begin again on the new page. For a single-page app, pass `navigate` (your router's push) so the page does not reload and the agent stays alive. A script-tag build cannot take options; use `window.webmcpTour.definePage(...)`, or import `createTour` from the package, to set pages and `navigate`.

## Examples
Three runnable apps in [`examples/`](examples): a script tag, a Vite bundle (a SPA with pages), and an engine embed with your own tool. Start with `pnpm example:script-tag`.

## Development

Uses **pnpm** (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up) and Node ≥ 22.18.

```sh
pnpm install
pnpm exec playwright install chromium   # once: Vitest runs tests in real Chromium
pnpm typecheck
pnpm build       # tsup → dist/index.js, dist/auto.js (ESM), dist/webmcp-tour.js (IIFE, sets window.webmcpTour)
pnpm test        # Vitest browser mode (Chromium + Firefox); the IIFE test needs the build
pnpm size        # gzip budget gate: engine-only ≤ 14 KB; full (/auto, script tag) ≤ 15 KB each
pnpm check       # all of the above, as CI runs it
pnpm demo        # build, then serve http://127.0.0.1:4173/demo/ (PORT overrides); see demo/README.md
```

CI: the GitHub Actions workflow is manual-only for now; run `pnpm check` locally before merging.

TypeScript is pinned to 6.x: tsup's `.d.ts` build needs the TypeScript compiler API, which TypeScript 7 no longer ships.

## License

MIT © Filipe Boldo
