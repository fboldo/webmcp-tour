---
title: Engine API
description: createTour options, the Tour methods, events, tool registration helpers and theming of the webmcp-tour engine.
order: 5
---

The engine is what the tools sit on. Use it directly to drive the overlay from your own code, to register the tools under your own names, or to write app tools that point as part of what they do. The package is side-effect free to import (no DOM access at import time).

```ts
import { createTour } from "webmcp-tour";
```

Exports: `createTour`, `registerAutoTools`, `defineTools`, `DEFAULT_NAMES`, `getModelContext`, `resolve`, `Overlay`, `MAX_TITLE` (80), `MAX_MESSAGE` (500), `VERSION`, and the types (`Tour`, `TourOptions`, `StepInput`, `StepResult`, `WaitInput`, `WaitResult`, `WaitOptions`, `DismissResult`, `PageDefinition`, `PageInfo`, `TargetDefinition`, `TargetInfo`, `TourEvents`, `Labels`, `OverlayOptions`, `OverlayStep`, `ShowResult`, `ToolDefinition`, `ToolNames`, `ToolResult`, `AutoHandle`, `AutoOptions`, `ModelContextLike`, `RegistrableTool`, `ResolveInput`, `ResolveResult`, `ResolverOptions`). `webmcp-tour/auto` is the side-effect entry that registers the tools.

## `createTour(options?)`

Returns the tour for this document. **One per document**: later calls return the first instance (a script tag and a bundle share one overlay), and the options of a later call are ignored with a `console.warn`. It touches no DOM until used.

### Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `scope` | `Element` | — | Only elements inside it can be pointed at. |
| `exclude` | CSS selector | — | Elements (and subtrees) that can never be pointed at. An invalid selector throws a `TypeError`. `data-tour-exclude` does the same in markup. |
| `locators` | `{ selector?: boolean; text?: boolean }` | both on | Turn a locator off. `target` is always on. A turned-off locator answers `invalid_input`. |
| `render` | `boolean` | `true` | `false` = headless: no DOM is created, only `show` / `dismiss` events fire. |
| `renderPopover` | `(step, defaultEl) => HTMLElement` | — | Replace the card's markup; the library keeps positioning and dismissal. See [Custom card](#custom-card). |
| `labels` | `Partial<Labels>` | English | Every user-facing string. See [Concepts](concepts.md#labels-and-translations). |
| `attribution` | `string` | "From your assistant" | Deprecated: use `labels.attribution`. |
| `takeMeThere` | `boolean` | `false` | Also show **Take me there** (scroll, focus, pulse) next to **Got it**. |
| `pages` | `PageDefinition[]` | — | The app's pages. |
| `navigate` | `(url: string) => void` | `location.assign` | Called only when the user presses **Go** on a suggestion. |
| `pageSuggestion` | `{ placement?: "center" \| "anchor" \| "corner" }` | `center` | Where the suggestion card goes. |
| `resume` | `false \| { param?: string }` | `{ param: "webmcp-tour" }` | Resume the step after **Go**. `false` turns it off. |
| `describeTarget` | `boolean` | `false` | Also point the target's `aria-describedby` at a hidden copy of the message while the step shows (restored on dismiss). |

`PageDefinition`: `{ id, url, title, description?, match? }`. `id`, `url` and `title` are non-empty strings; `match` is a string (pathname prefix), a `RegExp` or `(location) => boolean`. A page that fails these checks throws a `TypeError` from `definePage`.

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
| `tools(options?)` | `ToolDefinition[]` | Tool definitions to register yourself: `show_step`, `list_targets`, `dismiss`, `wait_for_interaction`, in that order. Registers nothing. `options.names` renames them. Throws on bad names. |
| `takeResumed()` | `{ page, target? } \| undefined` | After a resume, once; then `undefined`. |
| `destroy()` | `void` | Dismiss, remove the overlay and release the singleton. |

`show` input is a `StepInput`: `{ target?, selector?, text?, page?, index?, title?, message?, placement? }`.

### Events

```ts
const off = tour.on("dismiss", (e) => console.log(e.reason));
```

| Event | Payload |
|---|---|
| `show` | `{ target: Element, title, message, placement }` |
| `dismiss` | `{ target: Element, reason }`. `reason` is `hide` (dismissed by call, ×, or Escape), `superseded` (replaced by a newer step), `obscured` (a modal dialog took over), `acknowledged` (**Got it**), `navigating` (**Go**), or `declined` (a suggestion closed with **Not now**, ×, or Escape). |
| `targets` | `{}`. Fires when `defineTarget` or `definePage` adds or removes something. `data-tour-id` elements are read at call time and fire nothing. |

A listener that throws does not break the overlay (the error is rethrown asynchronously).

## Registering the tools

Three levels:

- **`import "webmcp-tour/auto"`** or the script tag: registers the four tools under the default names on the shared tour.
- **`registerAutoTools({ names? })`**: the same, as a call. Returns `{ ready, stop }`: `ready` settles once the initial registrations have (it never rejects); `stop()` unregisters every tool and releases the singleton. One registration per document: a second call returns the first handle. It is a no-op with one `console.info` where WebMCP is unavailable, and never throws.
- **`tour.tools({ names? })`**: definitions only, for you to register under your own names and timing:

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
