# API reference

Verified against `src/`. Everything is exported from `webmcp-tour`; `webmcp-tour/auto` is a side-effect import that calls `registerAutoTools()`.

## Entry points

| Import | Effect |
|---|---|
| `webmcp-tour/auto` | Creates the tour (no options) and registers the four tools. SSR-safe. |
| `webmcp-tour` | `createTour`, `registerAutoTools`, `defineTools`, `getModelContext`, `Overlay`, `resolve`, `DEFAULT_NAMES`, `MAX_TITLE` (80), `MAX_MESSAGE` (500), `VERSION`. No side effects. |
| `dist/webmcp-tour.js` (script tag) | Creates the tour, sets `window.webmcpTour`, registers the tools. `data-no-global` skips the global; `data-no-auto` skips registration. |

**The tour is a singleton per document.** `createTour(options)` returns the existing one if there is one, and warns (`console.warn`) when options are passed that get ignored. So: with options, call `createTour(options)` first, then `registerAutoTools()`; do not also import `webmcp-tour/auto` or load the script tag.

`registerAutoTools({ names? })` returns `{ ready: Promise<void>, stop() }`. Also a singleton: a second call returns the first handle. It registers all four tools, even with zero declarations. No-op with one `console.info` where WebMCP is unavailable.

## createTour(options)

All optional.

| Option | Type | Notes |
|---|---|---|
| `scope` | `Element` | Only elements inside can be pointed at. |
| `exclude` | CSS selector | Never pointed at. Also `data-tour-exclude`. Invalid selector throws `TypeError`. |
| `locators` | `{ selector?, text? }` booleans | Turn a locator off; `target` is always on. |
| `labels` | `Partial<Labels>` | `gotIt` "Got it", `takeMeThere` "Take me there", `close` "Dismiss", `attribution` "From your assistant", `goToPage` "Go to {page}", `notNow` "Not now", `otherPage` "Your assistant suggests going to {page}". |
| `attribution` | string | Deprecated; `labels.attribution` wins. |
| `takeMeThere` | boolean | Adds a button that scrolls, focuses and pulses. Default off. |
| `pages` | `PageDefinition[]` | `{ id, url, title, description?, match? }`. `match`: string = pathname prefix, RegExp on pathname, or `(location) => boolean`. Default: `url` path equals `location.pathname`. First match wins. |
| `navigate` | `(url) => void` | Called only on the user's **Go**. Default `location.assign`. Give the router's push for SPAs. |
| `pageSuggestion` | `{ placement? }` | `"center"` (default), `"anchor"` (ring the element marked `data-tour-page="<id>"`, which must not carry `data-tour-id`; falls back to center), `"corner"`. |
| `resume` | `false \| { param? }` | Default param `webmcp-tour`. Nonce in the URL, step in `sessionStorage`; single use, at most 2 minutes old, watches up to 5 s for the target. |
| `describeTarget` | boolean | Points the target's `aria-describedby` at a hidden copy of the message while shown. Default off. |
| `render` | boolean | `false` = headless: no DOM, only events. |
| `renderPopover` | `(step, defaultEl) => HTMLElement` | Replace card markup; the library keeps positioning and dismissal (`[part~=close]`, `[part~=gotit]`, `[part~=goto]` are wired). You own escaping. |

## Tour methods

- `show(step)`: `StepInput` = exactly one of `target`, `selector`, `text`, `page`; plus `index`, `title` (≤ 80), `message` (≤ 500; required unless the target has a description), `placement` (`auto|above|below`). Returns the envelope (see tool-envelopes.md).
- `waitForInteraction(input?, { signal?, timeoutMs? })`: `WaitInput` = at most one of `target`, `selector`, `text`; `index`; `events` (`click`/`change`). Internal deadline 20 s.
- `dismiss()`: idempotent.
- `defineTarget({ id, selector | element, page?, label?, description?, reveal? })` → remover. A target with only `page` (no element or selector) just says where a control lives; on its own page the element comes from `data-tour-id`. Throws on bad input.
- `definePage(page)` → remover.
- `page()`, `targets()`, `outline()`: what `tour_list_targets` reports.
- `on("dismiss" | "targets" | …, fn)` → unsubscribe. A dismiss event carries a `reason`: `hide`, `superseded`, `obscured`, `acknowledged`, `navigating`, `declined`.
- `tools({ names? })`: the four `ToolDefinition`s in order show, list, dismiss, wait. Registers nothing. Names: 1–57 chars `[A-Za-z0-9_-]`, distinct, else `TypeError`.
- `takeResumed()`: `{ page, target? }` once after a resume.
- `destroy()`.

## Declarative markup

`data-tour-id`, `data-tour-label`, `data-tour-description`, `data-tour-reveal`, `data-tour-page`, `data-tour-exclude`. Defined targets (`defineTarget`) win over markup for the same id.

## Own tool names

`defineTools(tour, names)` / `tour.tools({ names })` with `{ showStep, listTargets, dismiss, waitForInteraction }`. Defaults `tour_show_step`, `tour_list_targets`, `tour_dismiss`, `tour_wait_for_interaction`. Tool descriptions refer to siblings by the names you choose.
