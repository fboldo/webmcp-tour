---
name: webmcp-tour
description: Adds webmcp-tour to a web app so AI agents can show users where to click (highlight a control and explain it) instead of clicking for them. Use when the user wants in-app "how do I…?" guidance, onboarding, or agent help for steps the user must do themselves (sign-in, payments, two-factor, irreversible actions), or mentions webmcp-tour, WebMCP guided tours, tour_show_step, data-tour-id, or highlighting UI for an agent.
license: MIT
compatibility: Browser apps (plain HTML, React, Vue, Next, any SPA). WebMCP needs a secure context (https or localhost); the audit script needs Node 18+.
metadata:
  repository: https://github.com/fboldo/webmcp-tour
---

# webmcp-tour

webmcp-tour registers four read-only WebMCP tools. An agent calls them to **point at** a control with a short card ("Got it" button); the user does the click. It never clicks, types or navigates for anyone.

Tools: `tour_show_step`, `tour_list_targets` (page outline + declared targets), `tour_dismiss`, `tour_wait_for_interaction`.

## When to use it

- Users ask "how do I change X / where is Y?" and an agent can answer by showing the control.
- Onboarding and feature discovery.
- Steps the user must perform themselves: authentication, payments, two-factor, deleting things. Point at the control; never automate it.

Skip it for apps without a browser UI, or when the agent should act on the user's behalf (that is a normal WebMCP tool, see "Your own tools" below).

## 1. Install

Pick one:

```html
<!-- script tag: creates a default tour, registers its tools, sets window.webmcpTour -->
<script src="https://unpkg.com/webmcp-tour@<VERSION>/dist/webmcp-tour.js"
        integrity="sha384-<HASH>" crossorigin="anonymous"></script>
```

```ts
// bundler: SSR-safe (no DOM access at import time); registers nothing until you call it
import { createTour, registerAsWebMcpTool } from "webmcp-tour";
await registerAsWebMcpTool(createTour());
```

Pin an exact `<VERSION>` and add SRI: compute `<HASH>` with `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`. Use the real current version; do not use `@latest` with SRI. If the package is not published yet, install from the repo's build (`pnpm build`, serve `dist/webmcp-tour.js`).

The script tag takes JSON-safe options from `<script type="application/json" id="webmcp-tour-config">` (`pages`, `labels`, `pageSuggestion`, `resume`, `takeMeThere`). `navigate` is a function, so for it use `data-manual` on the script tag and `window.webmcpTour.createTour(...)` + `registerAsWebMcpTool(...)`, or import `createTour` (see [references/api.md](references/api.md)). `window.webmcpTour.tour` is the default tour: call `definePage` / `defineTarget` on it.

Where WebMCP is missing the library registers nothing and logs one `console.info`. It never throws.

## 2. Declare targets

Without any declaration, `tour_list_targets` still returns a page outline and agents can point at controls by visible text. Declare the controls that matter:

```html
<button data-tour-id="change-plan"
        data-tour-label="Change plan"
        data-tour-description="Opens the plan picker. Choose a plan, then confirm on the next screen.">
  Change plan
</button>
<button data-tour-id="two-factor"
        data-tour-reveal="Open Security, then expand Advanced.">Set up two-factor</button>
<button data-tour-exclude>Delete workspace</button>
```

| Attribute | Meaning |
|---|---|
| `data-tour-id` | Stable id the agent can use as `target`. |
| `data-tour-label` | Accessible-name override in target lists. |
| `data-tour-description` | Default card text when the agent gives no `message`. Author-written, so it is trustworthy. |
| `data-tour-reveal` | Hint returned when the element is hidden ("Open X, then expand Y"). |
| `data-tour-page` | Page id the target lives on (see step 3). |
| `data-tour-exclude` | Never pointed at, anywhere in its subtree. |

In code: `tour.defineTarget({ id, selector | element, label, description, reveal, page })`. It returns a remover. Use it for dynamic UI or when you cannot edit markup.

Good descriptions: one or two sentences, imperative, say what happens next and what the user must do, no secrets, no HTML (plain text, 500 characters max). Details in [references/writing-descriptions.md](references/writing-descriptions.md).

## 3. Pages (SPAs, multi-page apps)

Tell the tour where controls live so the agent can say "that is on another page":

```ts
import { createTour, registerAsWebMcpTool } from "webmcp-tour";
const tour = createTour({
  pages: [
    { id: "billing", url: "/billing", title: "Billing" },
    { id: "security", url: "/security", title: "Security" },
  ],
  navigate: (url) => router.push(url), // SPA: keep the page (and any embedded agent) alive. Default location.assign.
});
tour.defineTarget({ id: "two-factor", page: "security", label: "Set up two-factor", description: "Starts two-factor setup." });
await registerAsWebMcpTool(tour); // the four standard tools, bound to that tour
```

For an off-page target `tour_show_step` returns `other_page` and shows a card with **Go to Security** / **Not now**. Only the user's click calls `navigate`. The step then **resumes** on the new page through a one-time nonce (`?webmcp-tour=…`): the message never travels in the URL. Build any extra query from the URL `navigate` is given (it already carries the nonce).

## 4. Labels and i18n

`createTour({ labels: { gotIt, takeMeThere, close, attribution, goToPage, notNow, otherPage } })`. All optional; `goToPage` and `otherPage` take `{page}`. Translate every one, plus your descriptions. Opt in to scroll-and-focus with `takeMeThere: true`.

## Your own tools

When an app tool stages something the user must confirm, point at the confirm control from inside it:

```ts
const tour = createTour();
await document.modelContext.registerTool({
  name: "change_plan",
  description: "Stages a plan change. Nothing changes until the user confirms; Confirm is highlighted.",
  inputSchema: { type: "object", properties: { plan: { type: "string", enum: ["starter", "team", "business"] } }, required: ["plan"] },
  async execute({ plan }) {
    stage(plan);
    const step = await tour.show({ target: "confirm-plan", message: "Check the summary, then confirm." });
    return { staged: true, pointed: step.ok };
  },
});
```

`createTour({ names })` or `createTour({ toolPrefix: "billing" })` renames the four tools; with several tours every name must be distinct (`registerAsWebMcpTool([a, b])` throws otherwise). `tour.tools()` returns the definitions for your own `registerTool`. See the embed recipe in [references/frameworks.md](references/frameworks.md).

## Security defaults

- Tools are `readOnlyHint`; they only draw an overlay. Text is plain (`textContent`), never HTML.
- Never exposed: field values, attributes, URLs or hidden content. The outline lists visible names only.
- `exclude`, `data-tour-exclude`, `scope`, `aria-hidden`, `inert` and the tour's own overlay are never pointed at. Mark destructive or sensitive controls (delete, billing secrets, API keys) with `data-tour-exclude`.
- Do not put secrets, tokens or personal data in descriptions, labels, or `reveal` hints: agents read them.
- `window.webmcpTour` is page-global: any same-origin script can drive the overlay. Add `data-no-global` to the script tag to opt out.
- The resume nonce is single-use, expires in 2 minutes, and unknown nonces show nothing.
- Pin the version and use SRI for CDN loads.

## Testing

1. **Polyfill** (no native WebMCP): load `@w3c/webmcp-polyfill` (`dist/polyfill.js`) before the library, on https or localhost; it installs nothing when the browser already has `document.modelContext`, so detect first: `if (!document.modelContext) load the polyfill`. It provides `document.modelContext`; call a tool by hand with `await document.modelContext.executeTool("tour_list_targets", {})` (the result may be a JSON string).
2. **Playwright MCP + native WebMCP**: launch Chrome with the feature on:
   ```json
   { "browser": { "launchOptions": { "args": ["--enable-features=WebMCP"] } } }
   ```
   Tools appear as `webmcp_<name>` (e.g. `webmcp_tour_show_step`) after a page snapshot; the snapshot lists raw names, call the prefixed ones. Each call is capped at 30 s, so `tour_wait_for_interaction` may end early: call it again.
3. Ask real questions ("how do I turn on two-factor?") and check the highlight, the card text and the dismiss.

More in [references/troubleshooting.md](references/troubleshooting.md).

## Audit

`node scripts/audit.mjs <dir|file…>` scans HTML/JSX/TSX/Vue/Svelte for interactive elements missing `data-tour-id` / `data-tour-description` and prints suggestions. It is a heuristic: review its output, do not paste it blindly.

## Checklist

- [ ] Library loaded once, version pinned, SRI set (script tag).
- [ ] Key controls have `data-tour-id` and an author-written `data-tour-description`.
- [ ] Hidden or collapsed controls have `data-tour-reveal`.
- [ ] Destructive and sensitive controls have `data-tour-exclude`.
- [ ] Multi-page app: `pages` + `navigate` (router push for SPAs); targets carry `page`.
- [ ] `labels` translated; descriptions localised.
- [ ] Own tools that need user confirmation call `tour.show` and say so in their description.
- [ ] No secrets in any text an agent can read.
- [ ] Tested with the polyfill and with Playwright MCP + `--enable-features=WebMCP`.

## References

- [references/api.md](references/api.md): `createTour` options, `Tour` methods, exports.
- [references/tool-envelopes.md](references/tool-envelopes.md): tool inputs and result/error shapes.
- [references/frameworks.md](references/frameworks.md): plain HTML, React, Vue, Next.
- [references/writing-descriptions.md](references/writing-descriptions.md): agent-facing text.
- [references/troubleshooting.md](references/troubleshooting.md): common failures.
