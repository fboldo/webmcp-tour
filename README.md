# webmcp-tour

**Your app, narrated by whichever AI agent your user already has.** One script tag lets any WebMCP agent point at a control, explain it in a short card, and step back while the user clicks. It never clicks for them.

> **Pre-release / experimental.** Not on npm yet, the API may change, and WebMCP itself is still experimental in browsers.

![An agent is asked "How do I set up two-factor?" on the Billing page. A centred card offers "Go to Security"; after Go, Set up two-factor is highlighted with a "Got it" card.](site/content/images/demo.gif)

[Live demo](https://fboldo.github.io/webmcp-tour/demo/) · [Docs](https://fboldo.github.io/webmcp-tour/) · [Agent hosts](https://fboldo.github.io/webmcp-tour/agent-hosts/)

## Two ways to use it

### 1. Zero setup: one script tag

```html
<script src="https://unpkg.com/webmcp-tour"></script>
```

(Not published yet: until then, build it and serve `dist/webmcp-tour.js` yourself, as the [examples](examples) do.)

Any WebMCP agent can now list what is on the page (`tour_list_targets` returns a visible outline of headings and controls) and point at anything by its visible text. No markup, no config.

Optional settings go in a JSON block (JSON-safe options only: `pages`, `labels`, `pageSuggestion`, `resume`, `takeMeThere`; `navigate` is a function, so it cannot be set here). Add `data-manual` to the script tag to skip the automatic registration, or `data-no-global` to not expose `window.webmcpTour` (`{ tour, createTour, registerAsWebMcpTool }`).

```html
<script type="application/json" id="webmcp-tour-config">
  { "takeMeThere": true, "labels": { "gotIt": "Entendi" } }
</script>
```

### 2. Craft the experience

Install it, create a tour, register it:

```sh
npm install webmcp-tour   # not published yet: see Contributing to run it from source
```

```ts
import { createTour, registerAsWebMcpTool } from "webmcp-tour";

const tour = createTour();
const { unregister } = await registerAsWebMcpTool(tour); // or pass { signal } to unregister on abort
```

There is one package entry (`webmcp-tour`) and it is side-effect free (`sideEffects: false`), so it is safe to import on the server.

**Declare a target** so the agent answers in your words, not its guess:

```html
<button data-tour-id="change-plan"
        data-tour-description="Opens the plan picker. Changes apply after you confirm.">
  Change plan
</button>
```

**Declare pages** so an agent can say "that control is on another page", offer a **Go to Security** card, and have the step resume there after the user presses Go:

```ts
const tour = createTour({
  pages: [
    { id: "billing", url: "/billing", title: "Billing" },
    { id: "security", url: "/security", title: "Security" },
  ],
  navigate: (url) => router.push(url), // default: location.assign
});
tour.defineTarget({ id: "two-factor", page: "security", label: "Set up two-factor", description: "Starts two-factor setup." });
```

**Embed it in your own tools**, so your agent's answer and the highlight arrive together:

```ts
const result = await tour.show({ target: "two-factor", message: "Press this to start." });
// { ok: true, matched } | { ok: false, error: "other_page", page, message } | { ok: true, suggested } | ...
```

Several tours on one page (say, per product area) need distinct tool names: `createTour({ toolPrefix: "billing" })` gives `billing_show_step` and friends, and `registerAsWebMcpTool([billingTour, teamTour])` registers them together.

Translations, card placement, `resume`, and the rest are in the [concepts](https://fboldo.github.io/webmcp-tour/concepts/) and [engine API](https://fboldo.github.io/webmcp-tour/engine-api/) pages.

## Why guide instead of click?

An agent that clicks for the user needs the user's trust and the user's session. Guidance does not:

- **Auth and two-factor**: the user types their own secrets.
- **Payments and irreversible actions**: the agent shows the button; a person decides to press it.
- **Learning the app**: the user ends up knowing where things are.
- **The worst case is small**: a wrong highlight is ignored, not a wrong purchase.

## What agents get

Four tools, all marked `readOnlyHint`:

| Tool | What it does |
|---|---|
| `tour_list_targets` | The page outline (headings, controls with role, name, context), plus declared targets and pages |
| `tour_show_step` | Highlights a control (by declared id, visible text or selector) with a card; or suggests another page |
| `tour_wait_for_interaction` | Resolves when the user clicks it, presses **Got it**, **Go** or dismisses |
| `tour_dismiss` | Clears the current step |

Details: [tools reference](https://fboldo.github.io/webmcp-tour/tools/).

## Security and accessibility

- Tools only highlight. Navigation happens only when the user presses **Go**.
- Cards are labelled **From your assistant**, so a page cannot pass text off as its own.
- Resume uses a one-use random nonce in the URL; the message never travels in it, so crafted links show nothing.
- The outline never includes field values, attributes, URLs or hidden content; `data-tour-exclude` hides anything else.
- Announced through a live region, keyboard and Escape friendly, with light/dark, forced-colors and reduced-motion support.
- Zero dependencies; the page text is set as text, never as HTML.

See [security](https://fboldo.github.io/webmcp-tour/security/) and [accessibility](https://fboldo.github.io/webmcp-tour/accessibility/).

## Agent hosts

Honest status:

| Host | Status |
|---|---|
| Chrome with WebMCP (flag `chrome://flags/#enable-webmcp-testing`, or the origin trial) | Works |
| Playwright MCP with Chrome started with `--enable-features=WebMCP` | Works |
| In-page agents (on-device or hosted model called from your script) | Works, with the [W3C polyfill](https://github.com/webmachinelearning/webmcp) where the browser has no WebMCP |
| ChatGPT Desktop, Edge, Brave, others | Untested |

Setup and caveats: [agent hosts](https://fboldo.github.io/webmcp-tour/agent-hosts/).

## Using a coding agent to add it

An [Agent Skill](skills/webmcp-tour) teaches Claude Code, Cursor, Codex and others to add webmcp-tour to your app (declare targets, pages, descriptions, and test):

```sh
npx skills add fboldo/webmcp-tour --skill webmcp-tour
```

The repository is private for now, so the install needs GitHub access.

## Docs

[Quick start](https://fboldo.github.io/webmcp-tour/quick-start/) · [Concepts](https://fboldo.github.io/webmcp-tour/concepts/) · [Tools](https://fboldo.github.io/webmcp-tour/tools/) · [Engine API](https://fboldo.github.io/webmcp-tour/engine-api/) · [Examples](https://fboldo.github.io/webmcp-tour/examples/) · [FAQ](https://fboldo.github.io/webmcp-tour/faq/)

## Contributing

Node ≥ 22.18 and pnpm (pinned via `packageManager`; `corepack enable`).

```sh
pnpm install
pnpm exec playwright install chromium   # once: tests run in real browsers
pnpm check       # typecheck, build, tests, size budget (gzip: engine ≤ 16 KB, script tag ≤ 16 KB)
pnpm demo        # http://127.0.0.1:4173/demo/
pnpm docs:dev    # preview the docs site
pnpm example:script-tag   # also: example:embed, example:bundled
```

`node scripts/readme-gif.mjs` re-records the GIF above (needs ffmpeg). There is no CI yet; run `pnpm check` before opening a PR.

## License

MIT © Filipe Boldo
