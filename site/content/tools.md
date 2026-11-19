---
title: Tools reference
description: The four WebMCP tools (tour_show_step, tour_list_targets, tour_dismiss, tour_wait_for_interaction): inputs, every result envelope and error, statuses.
order: 4
---

The tour registers four tools. All are annotated `readOnlyHint: true` (they never change the page's data), and `tour_list_targets` also `untrustedContentHint: true` (its text comes from the page). The four are registered together, and if the browser refuses any of them the rest are unregistered and `registerAsWebMcpTool` rejects.

Names can be changed ([Engine API](engine-api.md)); bridges may prefix them (Playwright MCP exposes `webmcp_tour_show_step`, see [Agent hosts](agent-hosts.md)). The tool descriptions refer to their siblings by role and fill in the configured names.

## Result envelopes

Every result is an object with `ok`.

- Success: `{ "ok": true, … }`.
- Failure: `{ "ok": false, "error": "<code>", … , "isError": true }`. `isError: true` is added by the tool layer: hosts that honour it (Playwright MCP) report an MCP error; others ignore it. (`tour.show()` called directly from the [engine](engine-api.md) returns the same envelope without `isError`.)
- A tool never throws or rejects. An unexpected failure is `{ ok: false, error: "internal", message, isError: true }`.
- After the user was sent to another page and the step resumed, the **next** result of any tool carries `resumed: { page, target? }` once.

All text the page contributes to a result (`near`, `available`, `candidates`, target labels) is clipped in count and length, and never includes field values or attribute values.

## `tour_show_step`

Highlight an element with a short explanation beside it, or suggest going to another page. It only points: it never clicks or changes anything. A new step replaces the current one.

### Inputs

| Input | Type | Notes |
|---|---|---|
| `target` | string | A declared target id. |
| `selector` | string | A CSS selector. Visible elements only. |
| `text` | string | Visible text, label or `aria-label`. At most 200 characters. |
| `page` | string | A page id: ask the user to go there. |
| `index` | integer ≥ 0 | Pick among listed `ambiguous` candidates (0-based, document order). |
| `title` | string | Plain text, at most **80** characters. |
| `message` | string | Plain text, at most **500** characters. Required unless the target has a description. |
| `placement` | `"auto"` \| `"above"` \| `"below"` | Default `auto`. |

Give **exactly one** of `target`, `selector`, `text`, `page`. Prefer `text` or `target`; use `selector` only for something seen in a page snapshot.

### Success

Highlighting an element:

```json
{
  "ok": true,
  "matched": {
    "by": "text",
    "tag": "button",
    "role": "button",
    "name": "Change plan",
    "text": "Change plan",
    "disabled": false,
    "inViewport": true,
    "scrolledIntoView": false,
    "occluded": false
  },
  "note": "The highlight stays until dismissed. Call tour_dismiss when the user moves on."
}
```

- `by` is the locator that matched (`target`, `selector` or `text`); `role` is present when the element has one.
- `inViewport`: it was inside the viewport before the call scrolled. `scrolledIntoView`: the call scrolled it. `occluded`: a fixed or sticky element still covers the element's centre afterwards.
- The highlight stays until dismissed, superseded, or the user presses Got it, ×, or Escape.

Suggesting a page (`page` input):

```json
{
  "ok": true,
  "suggested": { "id": "security", "title": "Security" },
  "note": "A card asks the user whether to go. Nothing navigates unless they press Go."
}
```

### Errors

| `error` | Extra fields | Meaning and what to do |
|---|---|---|
| `invalid_input` | `message` | Wrong shape: not exactly one locator, an empty or non-string value, `text` over 200 characters, a bad `index` (also "index out of range: N candidates"), `title` or `message` over its limit, a bad `placement`, a selector that uses `:has()` or tests attribute values (use `text` or `target`), a locator turned off with `locators`, a missing `message` (when the target has no description), or `page` is the page the user is already on. Fix the call. |
| `ambiguous_target` | `candidates`, `count` | The declared id is on more than one element, so none is trusted. `candidates` lists them (up to 10). Use `text` or a selector, and tell the site's owner the id is duplicated. |
| `invalid_selector` | — | The CSS selector does not parse. |
| `target_not_found` | `available: string[]` | No such declared target (or it is excluded or out of scope). `available` lists up to 50 ids. |
| `not_found` | `near: string[]` | Nothing visible matched. `near` lists up to 8 visible control names that look close. A hidden element looks exactly like no match. Do not highlight a guess: call `tour_list_targets`. |
| `not_visible` | `reveal?` | The declared target exists but is hidden. `reveal` says what to do first (for example "Open Security, then expand Advanced."). Tell the user, then try again. |
| `ambiguous` | `candidates`, `count` | More than one match. `candidates` has up to 10 entries: `{ index, tag, role?, name, disabled, heading?, row?, landmark? }`. Retry with `index`, or a more specific locator. `count` is the total. |
| `other_page` | `page`, `message` | The target is declared for another page. A suggestion card is now showing; nothing moved. |
| `page_not_found` | `available: string[]` | No such page id. `available` lists the declared page ids. |
| `obscured` | `message` | A modal dialog is open and the target is not inside it (or a page suggestion cannot be shown over it). |
| `unavailable` | `message` | There is no document (server-side render). |
| `internal` | `message` | Unexpected failure. Check the page and try again. |

## `tour_list_targets`

What is on this page. If the agent cannot see the page, call this first, then point with `text` or `target`. Takes no input.

```json
{
  "ok": true,
  "outline": {
    "headings": ["Settings", "Billing", "API keys"],
    "controls": [
      { "role": "button", "name": "Change plan", "context": "Billing" },
      { "role": "link", "name": "Security", "context": "Account" }
    ]
  },
  "page": { "id": "billing", "title": "Billing" },
  "pages": [{ "id": "security", "title": "Security", "description": "Two-factor and account deletion." }],
  "targets": [
    { "id": "billing-plan", "label": "Change plan", "description": "Opens the plan picker.", "visible": true },
    { "id": "two-factor", "label": "Set up two-factor", "visible": false, "page": { "id": "security", "title": "Security" }, "onThisPage": false }
  ],
  "count": 2
}
```

| Field | Meaning |
|---|---|
| `outline` | `{ headings: string[], controls: { role?, name, context? }[], truncated? }`. Visible headings and controls only: at most 60 controls and 30 headings, names clipped to 60 characters. |
| `page` | The current page, when pages are declared and one matches. |
| `pages` | The other declared pages (`id`, `title`, `description?`). |
| `targets` | Declared targets: `id`, `label`, `description?`, `reveal?`, `visible`; off-page ones carry `page` and `onThisPage: false`. At most 50 entries. |
| `count` | How many targets exist in total. |
| `truncated` | `true` when `count` is more than the entries returned. |

`outline` is always present, even when nothing is declared. A target's `visible: false` means it is not rendered right now; `reveal` says what to do first. This tool has no error codes of its own (apart from `internal`).

## `tour_dismiss`

Remove the current highlight and explanation. Call it when the user moves on, asks something else, or says they found it. Takes no input. Idempotent.

```json
{ "ok": true, "dismissed": true }
```

## `tour_wait_for_interaction`

Wait until the user interacts with the highlighted element, or with one named by `target`, `selector` or `text`. Use it after `tour_show_step` to pause while the user does the step. It returns the kind of interaction and the element, never a field value.

### Inputs

| Input | Type | Notes |
|---|---|---|
| `target`, `selector`, `text` | string | At most one. None means the highlighted element. |
| `index` | integer ≥ 0 | Pick among candidates. |
| `events` | `("click" \| "change")[]` | Non-empty. Default: `click` for buttons and links, `change` for fields. Never `input`: the first keystroke is not the step. |

### Statuses (all `ok: true`)

| Result | Meaning |
|---|---|
| `{ status: "interacted", event: "click" \| "change", target: { tag, name } }` | The user clicked or changed the element. |
| `{ status: "acknowledged" }` | The user read the step and pressed **Got it**. They want to continue. |
| `{ status: "navigating" }` | A page suggestion was on screen and the user pressed **Go**. |
| `{ status: "dismissed" }` | A page suggestion was on screen and the user pressed **Not now**, ×, or Escape. |
| `{ status: "timeout" }` | Nothing happened within about **20 seconds**. Not a failure: the highlight stays; call again or ask the user. |
| `{ status: "superseded" }` | A newer `tour_show_step` or wait replaced this one. Not a failure. |

The wait holds its own deadline, shorter than the 30 s some hosts cut calls at. Only **trusted** events count; `el.click()` from script is ignored. A CDP-driven agent click is trusted, so `interacted` means an interaction happened, not that a person did it. The listener is on `window` in the capture phase and re-resolves the element on every event, so a re-render cannot strand it.

If the call fails, never returns, or returns after the page changed, check the page: the user most likely clicked the control.

### Errors

The same codes as `tour_show_step` for the locator (`invalid_input`, `invalid_selector`, `target_not_found`, `not_found`, `not_visible`, `ambiguous`), plus:

| `error` | Extra | Meaning |
|---|---|---|
| `no_step` | `message` | No locator given and nothing is highlighted. Point at an element first, or name the one to wait for. |
| `cancelled` | `message` | The host aborted the call; nobody is listening. |
| `unavailable` | `message` | There is no document. |
| `internal` | `message` | Unexpected failure. |

Waiting with no arguments while a page suggestion is on screen waits on the suggestion (`navigating` / `dismissed`).

## A typical exchange

1. `tour_list_targets` → the outline and the declared targets.
2. `tour_show_step({ target: "billing-plan" })` → `ok: true`; the user sees the highlight.
3. `tour_wait_for_interaction()` → `interacted` (the user clicked), `acknowledged`, or `timeout` (ask them, or call again).
4. `tour_dismiss()` when moving on.

For a control on another page: `tour_show_step({ target: "two-factor" })` → `other_page`; the agent tells the user to press Go; `tour_wait_for_interaction()` → `navigating`; after the page changes, the highlight appears by itself and the next result carries `resumed`.
