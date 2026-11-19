---
title: Quick start
description: Add webmcp-tour with a script tag or a bundler, and check that an agent can see the tools.
order: 2
---

Two requirements: a **secure context** (https, or `http://localhost`), and a browser or bridge that provides WebMCP (`document.modelContext`). See [Agent hosts](agent-hosts.md) for how to get one, including a polyfill for development.

> Install with `npm install webmcp-tour`, or use the script tag below. The library is experimental (0.x), so pin the version.

## With a script tag

`dist/webmcp-tour.js` is a single file (an IIFE). Include it and it creates a default tour and registers its four tools; nothing else is needed.

```html
<script src="https://unpkg.com/webmcp-tour@0.1.0/dist/webmcp-tour.js" crossorigin="anonymous"></script>
```

Pin the version, and add `integrity="sha384-…"` to lock the file: the hash of a release is `curl -s https://unpkg.com/webmcp-tour@0.1.0/dist/webmcp-tour.js | openssl dgst -sha384 -binary | openssl base64 -A` (in a clone, `pnpm build && pnpm sri`). You can also serve `dist/webmcp-tour.js` yourself.

That is the whole setup. `window.webmcpTour` is `{ tour, createTour, registerAsWebMcpTool }`: `tour` is the default tour, so you can configure it from your own script:

```html
<script src="/webmcp-tour.js"></script>
<script>
  webmcpTour.tour.defineTarget({
    id: "change-plan",
    selector: "#plan-button",
    description: "Opens the plan picker.",
  });
</script>
```

To give the default tour its options, add a JSON block anywhere before the script. Only JSON-safe options are read: `pages`, `labels`, `pageSuggestion`, `resume` and `takeMeThere`.

```html
<script type="application/json" id="webmcp-tour-config">
  { "pages": [{ "id": "billing", "url": "/billing", "title": "Billing" }], "labels": { "gotIt": "Entendi" } }
</script>
<script src="/webmcp-tour.js"></script>
```

The config must be a `<script type="application/json" id="webmcp-tour-config">` element; any other element with that id is ignored. A page `url` must be `http(s)` on the page's own origin; for another origin add `"allowCrossOrigin": true`. `navigate` is a function and cannot be JSON. For that, or for several tours, use `data-manual` and build the tours yourself with `webmcpTour.createTour(options)` and `webmcpTour.registerAsWebMcpTool(tour)`, or use a bundler as below.

Attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-no-global` | Do not set `window.webmcpTour`. `window.webmcpTour` is page-global: any same-origin script can drive the overlay, so opt out if that matters. |
| `data-manual` | Create the default tour but do not register its tools. Register them yourself with `webmcpTour.registerAsWebMcpTool(...)` ([Engine API](engine-api.md)). |

## With a bundler

```ts
import { createTour, registerAsWebMcpTool } from "webmcp-tour";

const tour = createTour({
  pages: [
    { id: "billing", url: "/billing", title: "Billing" },
    { id: "security", url: "/security", title: "Security" },
  ],
  navigate: (url) => router.push(url),
});
await registerAsWebMcpTool(tour); // registers the four tools of that tour
```

`createTour()` returns a new tour each time, so its options always apply. To register several tours, give each its own `toolPrefix` or `names` ([Engine API](engine-api.md)).

Importing `createTour` alone gives you the engine without registering any tool ([Engine API](engine-api.md)). The package is side-effect free: importing it on a server touches nothing ([FAQ](faq.md)).

## Declare a control (optional)

Mark up the controls you want agents to know about:

```html
<button data-tour-id="change-plan"
        data-tour-description="Opens the plan picker. Choose a plan, then press Confirm.">
  Change plan
</button>
```

`data-tour-description` is the default card text when the agent does not give a `message`. Other attributes: `data-tour-label` (accessible-name override in lists), `data-tour-reveal` (what to do first when the control is hidden), `data-tour-page` (which page it lives on), and `data-tour-exclude` (never point at this). See [Concepts](concepts.md).

## Check it works

1. Open the page in a WebMCP-capable browser (or add the polyfill, see [Agent hosts](agent-hosts.md)).
2. Ask the agent to list its tools. You should see `tour_show_step`, `tour_list_targets`, `tour_dismiss` and `tour_wait_for_interaction` (a bridge may add a prefix: Playwright MCP calls them `webmcp_tour_show_step`).
3. Ask "Where do I change my plan?". The agent calls `tour_list_targets`, then `tour_show_step`, and the control lights up.

Where WebMCP is missing, registration is skipped with one `console.info` that says why (not a secure context, a Permissions-Policy that blocks `tools`, or no `document.modelContext`). Nothing throws.

The [live demo](demo/) is the quickest way to see it first.

## Let a coding agent do it

An [Agent Skill](https://agentskills.io) teaches a coding agent (Claude Code, Cursor, Codex and others) to add webmcp-tour to your app: install, declare targets and pages, write good descriptions, and test.

```sh
npx skills add fboldo/webmcp-tour --skill webmcp-tour
```

The skill also has an audit script, `node skills/webmcp-tour/scripts/audit.mjs src/`, which lists controls that lack `data-tour-id` and `data-tour-description`.
