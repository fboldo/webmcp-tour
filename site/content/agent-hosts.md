---
title: Agent hosts
description: Which agents can call the tools: Playwright MCP, Chrome with WebMCP, in-page agents with the polyfill, and which hosts are untested.
order: 8
---

The tools are ordinary WebMCP tools, so the question is how an agent gets to the page's `document.modelContext`. Status below is what has been tried, not what is promised.

| Host | Status |
|---|---|
| Playwright MCP, with Chrome launched with WebMCP on | Works. Setup below. |
| Chrome with WebMCP (flag, or the WebMCP origin trial) | Works where the browser provides `document.modelContext`. |
| In-page agent (on-device model, hosted model called from page script) | Works, using the W3C polyfill where the browser has no WebMCP. The [demo](demo/) is one. |
| ChatGPT Desktop | **Untested.** |
| Microsoft Edge | **Untested.** |
| Brave | **Untested.** |

## Playwright MCP

Playwright MCP reaches WebMCP tools only in Chrome launched with the feature on. In its config:

```json
{ "browser": { "launchOptions": { "args": ["--enable-features=WebMCP"] } } }
```

- The tools show up as `webmcp_<name>`, for example `webmcp_tour_show_step`, **after a page snapshot**. The snapshot lists the raw names (`tour_show_step`); call the prefixed ones.
- Each call is capped at about 30 seconds by the host. `tour_wait_for_interaction` ends itself after about 20 s with `timeout` (which is not a failure), so call it again or ask the user.
- Failure envelopes carry `isError: true`, which Playwright MCP reports as an MCP error.
- A CDP-driven click from the agent counts as a trusted event, so `interacted` can mean the agent clicked. In guidance mode the agent should not.

## Chrome

WebMCP in Chrome is experimental and its status changes; check Chrome's own documentation for the current state.

- **Flag.** In Chrome 146 and later builds that carry it, `chrome://flags/#enable-webmcp-testing` ("WebMCP for testing") turns WebMCP on. Restart the browser after setting it.
- **Origin trial.** Chrome has run a WebMCP origin trial on desktop. A site that registers for it gets WebMCP for its visitors without a flag. Look up the current trial and token at [Chrome's origin trials page](https://developer.chrome.com/origintrials/) before relying on it.
- **Secure context.** WebMCP needs https or `http://localhost`.
- **The entry point.** The spec uses `document.modelContext`. Older trial builds exposed `navigator.modelContext`; the library looks at both and uses whichever has `registerTool`.
- **Permissions Policy.** A `tools` Permissions-Policy that blocks WebMCP is detected; the library says so in its `console.info`.

## In-page agents and the polyfill

An agent that runs inside your page (Chrome's on-device Prompt API, or a hosted model you call from script) cannot see the page, but it can call tools through `document.modelContext.executeTool`. That is what `tour_list_targets`' `outline` is for.

Where the browser has no WebMCP, load the [W3C polyfill](https://github.com/webmachinelearning/webmcp) (`@w3c/webmcp-polyfill`) before the tour, and `document.modelContext` appears:

```html
<script src="/vendor/polyfill.js"></script>
<script src="/webmcp-tour.js"></script>
```

The [live demo](demo/) does exactly this and runs a small in-page assistant with four modes: a scripted agent (no model), Chrome's Prompt API in JSON-constrained mode, the Prompt API with native tool use, and OpenRouter with your own key. Pick the mode from its **Mode** menu.

Notes for in-page agents:

- A **full page load** restarts the agent. For a single-page app, pass `navigate` (your router's push) so the page does not reload; otherwise the highlight still resumes after Go, but the agent starts over.
- The agent should call `tour_list_targets` first, then point with `text` or a declared `target`, and answer in its own words what the card says.

## ChatGPT Desktop, Edge, Brave

These may offer WebMCP or something like it; nobody has tried this library there. If you do, the things to check are: are the four tools listed, what are they called (bridges prefix names), and do failure envelopes show up. Please report what you find in the repository's issues.
