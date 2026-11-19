---
title: FAQ
description: How webmcp-tour differs from browser agents and product-tour libraries, bundle size, SSR, and other common questions.
order: 10
---

## How is this different from a browser agent?

A browser agent (a computer-use model, a Playwright-driven assistant) **acts**: it clicks, types and navigates for the user. webmcp-tour **guides**: it highlights and explains, and the user acts. The two can coexist. A site can offer guidance tools to any agent, including a browser agent, and the agent can choose to show instead of do when the user asks "where is…?" or when the action is consequential.

## How is this different from a product-tour library?

Tour libraries (Shepherd, Driver.js, Intro.js and similar) play a **scripted** tour that the site's authors wrote step by step. Here the **agent** decides, per question, what to point at and what to say, and the site only describes what it has. You can still write descriptions that read like scripted copy ([Concepts](concepts.md)).

## Do I need to declare anything?

No. A script tag is enough: the agent reads the visible outline and points by text. Declared targets and pages make answers better and add other-page suggestions and resume ([Overview](index.md)).

## How big is it?

Zero dependencies. The gate in `scripts/check-size.mjs` keeps each build under **16 KB gzipped**: the engine alone (`createTour`) and the script-tag file (default tour and tool registration included). `pnpm size` prints the current numbers.

## Does it work with server-side rendering?

Importing is safe on a server: the package does no DOM access at import time and registers nothing until you call `registerAsWebMcpTool`. Calls that need a page return `unavailable` ("There is no document") rather than throwing. Create and use the tour on the client, in an effect or a client-only module.

## Which frameworks?

Any. It works on the real DOM, so React, Vue, Svelte and plain HTML are the same. For client-side routers, pass `navigate` so the page does not reload. The coding-agent [skill](quick-start.md) has framework notes.

## Does it need WebMCP to be installed?

It needs a browser or bridge that provides `document.modelContext`, or the polyfill ([Agent hosts](agent-hosts.md)). Without one, nothing is registered, with a single `console.info` that says why, and the engine (`tour.show()`) still works if you call it from your own code.

## Can the agent click the control for the user?

Not with this library. That is the point. A bridge may give the agent other tools (browser automation); this library's tools are read-only.

## Why did a step not appear?

Check the result envelope: `not_visible` (the control is hidden; see `reveal`), `obscured` (a modal dialog is open), `other_page`, `ambiguous` (retry with `index`) or `not_found` (use `tour_list_targets`). All codes are in the [Tools reference](tools.md).

## Which browsers?

The overlay is tested in Chromium and Firefox. Card placement uses CSS anchor positioning where available and a computed fixed position elsewhere.

## Is there a version I can install?

The library is pre-release and not on npm yet. Use a build of the repository until it is.

## Is there an `llms.txt`?

Yes: [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt), generated from these same pages. Every page also has a Markdown source (for example [tools.md](tools.md)).
