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
- **`tour_list_targets`** also returns the page `outline` (below), and the current `page`, the other `pages`, and every target; off-page ones carry `page: { id, title }` and `onThisPage: false`.
- **`tour_show_step`** takes a fifth locator, `{ page: "security" }`. For an off-page target, or an explicit `page`, it shows a card with no spotlight (unless anchored, below): the `otherPage` text, **Go to Security** and **Not now**. The envelope is `{ ok: false, error: "other_page", page }` for a target, and `{ ok: true, suggested: page }` for a `page` locator. A call never navigates; only the user's click on **Go** calls `navigate(url)`.
- **Waiting.** With a suggestion on screen, `tour_wait_for_interaction` resolves `{ status: "navigating" }` on **Go** and `{ status: "dismissed" }` on **Not now**, ×, or Escape.

### The page outline

Agents inside the page (an on-device model, a hosted model called from page script) cannot see it, so `tour_list_targets` also returns what a person sees: `outline: { headings: [...], controls: [{ role, name, context }] }`. Controls are visible links, buttons, fields (by label), selects, tabs and menu items; `name` is the accessible name and `context` the nearest landmark or heading. The agent points at one with `tour_show_step({ text })`. The tool is registered whenever a document exists, even with nothing declared.

Same privacy rules as the `near` list of a miss: visible elements only, never field values, attributes, URLs or hidden content; `scope`, `exclude`, `data-tour-exclude`, `aria-hidden`, `inert` and the tour's own overlay are honoured. At most 60 controls and 30 headings, names clipped to 60 characters; `truncated: true` when capped. Also `tour.outline()`.

### Where the suggestion card goes

```ts
createTour({ pageSuggestion: { placement: "center" } }); // "center" (default) | "anchor" | "corner"
```

- **`center`**: the card is centred in the viewport, in the top layer, over a light backdrop that never blocks the page (`pointer-events: none`, and the card is a non-modal popover). It is focusable (`tabindex="-1"`, not focused for you) and announced through the live region. Escape and **Not now** dismiss it.
- **`anchor`**: the card attaches to an on-page element marked `data-tour-page="<page id>"` (say, the nav link) and rings it. The marked element must not also carry `data-tour-id` (that marks a target) and must be visible, in `scope` and not excluded; when none is, the card is centred instead.
- **`corner`**: bottom-right, as before.

Forced-colors, reduced-motion and `labels` apply to all three.

### Resuming the step after navigation

On **Go** the tour keeps the step it was heading for (page id, target, title, message, a timestamp) in `sessionStorage` under a random nonce, and adds only that nonce to the destination URL:

```ts
createTour({ resume: { param: "webmcp-tour" } }); // the default; `resume: false` turns it off
// Go -> navigate("/security?webmcp-tour=9f2c…")
```

- **On load**, or, for a single-page app, after `navigate()` returns, the tour looks the nonce up. A fresh entry (at most 2 minutes old) is shown as the step, as soon as its target is on the page (a `MutationObserver` watches for it, at most 5 seconds). Then the parameter is removed with `history.replaceState` and the entry deleted: **one use**.
- **Security.** The message, title and target never go in the URL. A link with an unknown, expired or already used nonce shows nothing (and the parameter is removed), so nobody can use a crafted link to make your site display text "from your assistant". The nonce is only looked up in this tab's `sessionStorage`; same-origin destinations only (a URL on another origin is used as is, with no nonce).
- **Agents.** The next tool result after a resume carries `resumed: { page, target? }` (`tour.takeResumed()` gives the same once). A `tour_wait_for_interaction` that ended with `navigating` is finished for good, but one called with no arguments while a resume is still looking for its target waits for it, then waits on the resumed highlight as usual.
- **Full page loads.** An agent embedded in the page restarts, but the highlight still resumes: it does not depend on the agent. If your `navigate` appends its own query string, build it from the URL it is given (it already carries the nonce).

Agents embedded in the page restart after a full page load, so after **Go** they begin again on the new page. For a single-page app, pass `navigate` (your router's push) so the page does not reload and the agent stays alive. A script-tag build cannot take options; use `window.webmcpTour.definePage(...)`, or import `createTour` from the package, to set pages and `navigate`.

## Use with coding agents

An [Agent Skill](https://agentskills.io) in [`skills/webmcp-tour`](skills/webmcp-tour) teaches a coding agent (Claude Code, Cursor, Codex and others) to add webmcp-tour to your app: install with SRI, declare targets, pages and resume, write descriptions, and test.

```sh
npx skills add fboldo/webmcp-tour --skill webmcp-tour
```

The repository is private for now, so the install needs GitHub access to it (`gh auth login` or an SSH key). It also includes an audit script: `node skills/webmcp-tour/scripts/audit.mjs src/` lists controls that lack `data-tour-id` / `data-tour-description`.

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
pnpm size        # gzip budget gate: engine-only ≤ 15 KB; full (/auto, script tag) ≤ 16 KB each
pnpm check       # all of the above, as CI runs it
pnpm demo        # build, then serve http://127.0.0.1:4173/demo/ (PORT overrides); see demo/README.md
```

CI: the GitHub Actions workflow is manual-only for now; run `pnpm check` locally before merging.

TypeScript is pinned to 6.x: tsup's `.d.ts` build needs the TypeScript compiler API, which TypeScript 7 no longer ships.

## License

MIT © Filipe Boldo
