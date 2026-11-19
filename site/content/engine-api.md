---
title: Engine API
description: createTour options, the Tour methods, events, tool registration helpers and theming of the webmcp-tour engine.
order: 5
---

The engine is what the tools sit on. Use it directly to drive the overlay from your own code, to register the tools under your own names, or to write app tools that point as part of what they do. The package is side-effect free to import (no DOM access at import time).

```ts
import { createTour } from "webmcp-tour";
```

Exports: `createTour`, `registerAsWebMcpTool`, `defineTools`, `DEFAULT_NAMES`, `getModelContext`, `resolve`, `Overlay`, `MAX_TITLE` (80), `MAX_MESSAGE` (500), `VERSION`, and the types (`Tour`, `TourOptions`, `StepInput`, `StepResult`, `WaitInput`, `WaitResult`, `WaitOptions`, `DismissResult`, `PageDefinition`, `PageInfo`, `TargetDefinition`, `TargetInfo`, `TourEvents`, `Labels`, `OverlayOptions`, `OverlayStep`, `ShowResult`, `ToolDefinition`, `ToolNames`, `ToolResult`, `RegisterOptions`, `Registration`, `ModelContextLike`, `RegistrableTool`, `ResolveInput`, `ResolveResult`, `ResolverOptions`). Nothing runs at import: no tool is registered and no DOM is touched until you call something.

## `createTour(options?)`

Returns a **new tour on every call**, with its own options. Tours on one page share the screen (see [Registering the tools](#registering-the-tools)). It mounts only a hidden live region until a step is shown.

### Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `scope` | `Element` | — | Only elements inside it can be pointed at. |
| `exclude` | CSS selector | — | Elements (and subtrees) that can never be pointed at. An invalid selector throws a `TypeError`. `data-tour-exclude` does the same in markup. |
| `locators` | `{ selector?: boolean; text?: boolean }` | both on | Turn a locator off. `target` is always on. A turned-off locator answers `invalid_input`. |
| `render` | `boolean` | `true` | `false` = headless: no DOM is created, only `show` / `dismiss` events fire. |
| `renderPopover` | `(step, defaultEl) => HTMLElement` | — | Replace the card's markup; the library keeps positioning and dismissal. See [Custom card](#custom-card). |
| `labels` | `Partial<Labels>` | English | Every user-facing string. See [Concepts](concepts.md#labels-and-translations). |
| `takeMeThere` | `boolean` | `false` | Also show **Take me there** (scroll, focus, pulse) next to **Got it**. |
| `pages` | `PageDefinition[]` | — | The app's pages. |
| `navigate` | `(url: string) => void` | `location.assign` | Called only when the user presses **Go** on a suggestion. |
| `pageSuggestion` | `{ placement?: "center" \| "anchor" \| "corner" }` | `center` | Where the suggestion card goes. |
| `resume` | `false \| { param?: string }` | `{ param: "webmcp-tour" }` | Resume the step after **Go**. `false` turns it off. |
| `names` | `Partial<ToolNames>` | `tour_show_step` etc. | Tool names for this tour's four tools (see `registerAsWebMcpTool`). |
| `toolPrefix` | `string` | — | Shorthand for `names`: `"billing"` gives `billing_show_step`, `billing_list_targets`, `billing_dismiss`, `billing_wait_for_interaction`. |
| `describeTarget` | `boolean` | `false` | Also point the target's `aria-describedby` at a hidden copy of the message while the step shows (restored on dismiss). |

`PageDefinition`: `{ id, url, title, description?, match?, allowCrossOrigin? }`. `id`, `url` and `title` are non-empty strings; `url` must be `http(s)` (or relative) and on the page's own origin, unless you set `allowCrossOrigin: true` or pass your own `navigate`; `match` is a string (pathname prefix), a `RegExp` or `(location) => boolean`. A page that fails these checks throws a `TypeError` from `definePage`.

`TargetDefinition`: `{ id, selector?, element?, page?, label?, description?, reveal? }`. Give exactly one of `selector` or `element`, or neither when only `page` is set. Bad input throws a `TypeError`.

### Methods

| Method | Returns | Notes |
|---|---|---|
| `show(step)` | `Promise<StepResult>` | Resolve the step's element, point at it, return the tool-shaped envelope (see [Tools reference](tools.md)). Replaces the current step. |
| `waitForInteraction(input?, options?)` | `Promise<WaitResult>` | Resolves when the user interacts with the highlighted element (or the one named). A new wait or a new `show` settles the pending one with `superseded`. Options: `signal` (teardown) and `timeoutMs` (default 20 000). |
| `dismiss()` | `{ ok: true, dismissed: true }` | Remove the highlight. Idempotent. |
| `on(type, fn)` | `() => void` | Subscribe; the return value unsubscribes. See [Events](#events). |
| `defineTarget(def)` | `() => void` | Declare a target in code. The return value removes it. |
| `definePage(def)` | `() => void` | Declare a page. The return value removes it. |
| `page()` | `PageInfo \| undefined` | The current page, if one matches. |
| `targets()` | `{ targets, total, page?, pages? }` | Declared targets as `tour_list_targets` reports them (capped at 50; `total` counts all). |
| `outline()` | `{ headings, controls, truncated? }` | The visible outline. |
| `tools(options?)` | `ToolDefinition[]` | Tool definitions to register yourself: `show_step`, `list_targets`, `dismiss`, `wait_for_interaction`, in that order. Registers nothing. Named by the tour's `names` / `toolPrefix`; `options.names` renames them further. Throws on bad names. |
| `takeResumed()` | `{ page, target? } \| undefined` | After a resume, once; then `undefined`. |
| `destroy()` | `void` | Dismiss and remove this tour's overlay. |

`show` input is a `StepInput`: `{ target?, selector?, text?, page?, index?, title?, message?, placement? }`.

### Events

```ts
const off = tour.on("dismiss", (e) => console.log(e.reason));
```

| Event | Payload |
|---|---|
| `show` | `{ target: Element, title, message, placement }` |
| `dismiss` | `{ target: Element, reason }`. `reason` is `hide` (dismissed by call), `closed` (the user pressed × or Escape on a step), `superseded` (replaced by a newer step), `obscured` (a modal dialog took over), `acknowledged` (**Got it**), `navigating` (**Go**), or `declined` (a suggestion closed with **Not now**, ×, or Escape). |
| `targets` | `{}`. Fires when `defineTarget` or `definePage` adds or removes something. `data-tour-id` elements are read at call time and fire nothing. |

A listener that throws does not break the overlay (the error is rethrown asynchronously).

## Registering the tools

`createTour()` returns a **new tour on every call**; options belong to the tour you pass them to. Tours on one page share the screen: showing a step in one clears the step (and a pending wait) of another.

- **`registerAsWebMcpTool(tour | tour[], { signal? })`** registers the tour's four tools on `document.modelContext`. It returns `Promise<{ unregister() }>`; `unregister()` (or aborting `signal`) removes every tool that call registered. It is a no-op with one `console.info` where WebMCP is unavailable. Registration is all or nothing: if the browser refuses any tool (a duplicate name from another copy of the library, say), the ones that did register are unregistered and the promise **rejects**. It is `async`, so it never throws synchronously: `await` it or add a `.catch` (`void registerAsWebMcpTool(tour)` would leave an unhandled rejection).
- **`tour.tools({ names? })`**: definitions only, for you to register under your own names and timing:

```ts
import { createTour, registerAsWebMcpTool } from "webmcp-tour";

const tour = createTour({ pages, navigate });
const { unregister } = await registerAsWebMcpTool(tour);
```

For several tours, every tool name must be distinct. Give each tour a `toolPrefix` (`"billing"` gives `billing_show_step`, `billing_list_targets`, `billing_dismiss`, `billing_wait_for_interaction`) or `names`; a duplicate across the array rejects the returned promise with a `TypeError` before anything registers:

```ts
await registerAsWebMcpTool([
  createTour({ toolPrefix: "billing", pages: billingPages }),
  createTour({ names: { showStep: "docs_point_at", listTargets: "docs_list", dismiss: "docs_clear", waitForInteraction: "docs_wait" } }),
]);
```

To register by hand:

```ts
import { createTour, getModelContext } from "webmcp-tour";

const tour = createTour();
const mc = getModelContext(); // document.modelContext (or the legacy navigator one), or null
for (const tool of tour.tools({ names: { showStep: "settings_point_at" } })) mc?.registerTool(tool);
```

Names must be distinct, 1 to 57 characters of letters, digits, `_` or `-`; the keys are `showStep`, `listTargets`, `dismiss`, `waitForInteraction`. Defaults are in `DEFAULT_NAMES`.

A `ToolDefinition` is structurally a WebMCP tool: `{ name, title, description, inputSchema, annotations, execute(input, { signal }) }`. `execute` never throws or rejects.

### Pointing from your own tool

`tour.show()` can be called inside any tool of yours. The [embed example](examples.md) stages a plan change in the UI, then points at Confirm, and returns `{ staged: true, pointed: true }`: the user still presses the button.

## Theming

Defaults are system colours (`Canvas`, `CanvasText`, `AccentColor`), so the card follows the page's light or dark scheme. The overlay lives in a shadow root and is styled with `adoptedStyleSheets`, so it is CSP-safe under `style-src 'self'`. Documented custom properties, set on the page (they inherit into the shadow tree):

| Property | Default | Controls |
|---|---|---|
| `--tour-surface` | `Canvas` | Card background |
| `--tour-text` | `CanvasText` | Card text |
| `--tour-muted` | mix of text and surface | Attribution text |
| `--tour-ring` | `AccentColor` | The spotlight outline |
| `--tour-radius` | `8px` | Card corner radius |
| `--tour-shadow` | `0 6px 24px rgb(0 0 0 / .25)` | Card shadow |
| `--tour-overlay-opacity` | `.35` | Dimming outside the spotlight |

```css
:root { --tour-ring: #7a3cff; --tour-radius: 12px; }
```

The shadow parts are also styleable with `::part()` on `[data-webmcp-tour-root]`: `spotlight`, `popover`, `attribution`, `title`, `message`, `actions`, `close`, `gotit`, `goto`, `go`, `notnow`, `live`.

### Custom card

`renderPopover(step, defaultEl)` receives `{ target, title, message, placement }` and the built-in card, already filled in, and returns an element. The library owns positioning, the `popover` attribute and dismissal: any `[part~=close]`, `[part~=gotit]` or `[part~=goto]` inside the returned element is wired. You own everything else, including escaping. A hook that throws falls back to the default card. It applies to step cards, not to page suggestions.

## Lower level

- `resolve({ target | selector | text, index? }, options?)` finds an element exactly as `show` does (and scrolls it into view), without drawing anything. It returns `{ ok: true, element, matched }` or an error envelope.
- `Overlay` is the card and spotlight on their own: `new Overlay(options).show(element, { title, message, placement })`.
- `getModelContext()` returns the page's WebMCP model context, or `null` (with one `console.info` saying why).

## Script-tag configuration

The script-tag build (`dist/webmcp-tour.js`) is configured on its own tag: `data-config` (the id of one `<script type="application/json">` block, or inline JSON), `data-manual`, `data-no-global`. These are read from `document.currentScript`, which is null when the file is bundled as a module, so there is no config and no flag in that case. With the `webmcp-tour` package, pass options to `createTour` instead.
