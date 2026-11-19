# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No tools appear; console says "tools not registered, …" | The message names why: not a secure context (use https or localhost), a `tools` Permissions-Policy blocks it, or the browser has no `document.modelContext`. Load `@w3c/webmcp-polyfill` first, or use Chrome with WebMCP enabled. |
| Playwright MCP shows no tools | Launch Chrome with `--enable-features=WebMCP`; take a page snapshot; call the `webmcp_`-prefixed names. |
| `createTour` options ignored; console warns "a tour already exists" | Something created the tour first: `webmcp-tour/auto`, the script tag, or an earlier `createTour()`. Create it with options before anything else; remove the other loader. |
| `not_found` with a `near` list | No visible element with that text. Use a name from `near` or `tour_list_targets`; or declare the control with `data-tour-id`. |
| `not_visible` | Hidden or collapsed. Add `data-tour-reveal` so the agent can tell the user what to open. |
| `ambiguous` | Several matches. Retry with `index`, or give the controls distinct `data-tour-label`s. |
| `other_page` | Target is declared for another page. Expected: the user was asked to go. Make sure `navigate` is the router push in an SPA. |
| `obscured` | A modal dialog is open and the target is outside it. Close the dialog or point at a control inside. |
| Resumed step does not show | The nonce is single-use and expires after 2 minutes; the target must appear within 5 s of load. Check that the target's `page` matches the destination (`match` or `url` path equals `location.pathname`). If your `navigate` rebuilds the query string, keep the given parameter. |
| Embedded agent restarts after Go | A full page load. Pass `navigate` (router push) for SPAs. |
| Excluded control still mentioned in an agent's answer | The tour never points at it, but the agent may know it from elsewhere. Remove it from its own tool descriptions too. |
| `tour_wait_for_interaction` returns `timeout` | Not a failure: the user has not acted. Call again or ask. Playwright MCP cuts calls at 30 s. |
| `defineTarget` throws | Needs a non-empty `id` and exactly one of `selector` or `element` (or only `page`); the selector must be valid. |
| Tool registration "skipped" warning | A duplicate tool name (`InvalidStateError`). Do not register the tour tools twice; use `names` to avoid collisions with your own tools. |
