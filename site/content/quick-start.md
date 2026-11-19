---
title: Quick start
description: Add webmcp-tour with a script tag or a bundler, and check that an agent can see the tools.
order: 2
---

Two requirements: a **secure context** (https, or `http://localhost`), and a browser or bridge that provides WebMCP (`document.modelContext`). See [Agent hosts](agent-hosts.md) for how to get one, including a polyfill for development.

> The package is not published to npm yet. Until it is, build it from the repository (`pnpm install && pnpm build`) and use the files in `dist/`. The names below are what the published package will use.

## With a script tag

`dist/webmcp-tour.js` is a single file (an IIFE). Include it and the four tools are registered; nothing else is needed.

```html
<script src="/webmcp-tour.js"></script>
```

That is the whole setup. The script also creates the tour and exposes it as `window.webmcpTour`, so you can configure it from your own script:

```html
<script src="/webmcp-tour.js"></script>
<script>
  webmcpTour.defineTarget({
    id: "change-plan",
    selector: "#plan-button",
    description: "Opens the plan picker.",
  });
</script>
```

A script tag cannot take options, because the tour is already created when your code runs. To set `pages`, `navigate`, `labels` and the other [options](engine-api.md), use `webmcpTour.definePage(...)` and `webmcpTour.defineTarget(...)`, or use a bundler as below.

Attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-no-global` | Do not set `window.webmcpTour`. The tour is still reachable through `globalThis[Symbol.for("webmcp-tour")]`. `window.webmcpTour` is page-global: any same-origin script can drive the overlay, so opt out if that matters. |
| `data-no-auto` | Do not register the tools. Register them yourself with `tour.tools()` ([Engine API](engine-api.md)). |

## With a bundler

```ts
import { createTour, registerAutoTools } from "webmcp-tour";

createTour({
  pages: [
    { id: "billing", url: "/billing", title: "Billing" },
    { id: "security", url: "/security", title: "Security" },
  ],
  navigate: (url) => router.push(url),
});
registerAutoTools(); // registers the four tools on that tour
```

**The first `createTour()` call decides the options.** There is one tour per document; later calls return the first one and log a warning if you passed options. The side-effect import `import "webmcp-tour/auto"` is the same as calling `registerAutoTools()`, which creates a default tour if none exists yet. ES imports are hoisted, so with that form put your `createTour(options)` call in a module that is imported *before* it (the demo does this), or just call `registerAutoTools()` yourself as above.

Importing only `createTour` from `webmcp-tour` gives you the engine without registering any tool ([Engine API](engine-api.md)). Both entry points are side-effect safe to import on a server: nothing touches the DOM at import time ([FAQ](faq.md)).

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

The repository is private for now, so the install needs GitHub access to it. The skill also has an audit script, `node skills/webmcp-tour/scripts/audit.mjs src/`, which lists controls that lack `data-tour-id` and `data-tour-description`.
