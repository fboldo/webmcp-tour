# Tool inputs and results

Failures carry `isError: true` (hosts such as Playwright MCP then report an MCP error). Every tool also adds `resumed: { page, target? }` to the first result after a resumed step.

## tour_show_step

Input: exactly one of `target`, `selector`, `text`, `page`; optional `index` (0-based), `title`, `message`, `placement`.

| Result | Meaning |
|---|---|
| `{ ok: true, matched: { by, tag, role?, name, text, disabled, inViewport, scrolledIntoView, occluded }, note }` | Highlighted. Stays until dismissed. |
| `{ ok: true, suggested: { id, title }, note }` | `page` locator: a Go / Not now card is showing. |
| `{ ok: false, error: "other_page", page, message }` | Target is on another page; a card asks the user. Nothing moved. |
| `invalid_input` (`message`), `invalid_selector` | Bad arguments (e.g. missing `message`, two locators, text too long). |
| `ambiguous_target` (`candidates`, `count`) | The id is declared on several elements; none is trusted. Use `text` or a plain selector. |
| `target_not_found` (`available`) | Unknown id; the list says what exists. |
| `not_found` (`near`) | No visible match; `near` lists visible names. |
| `not_visible` (`reveal?`) | Exists but hidden; `reveal` says what to open. |
| `ambiguous` (`candidates`, `count`) | Several matches; retry with `index`. |
| `page_not_found` (`available`) | Unknown page id. |
| `obscured` | A modal dialog the target is not inside is open. |
| `unavailable` | No document (SSR). |

## tour_list_targets

Input: none. Result: `{ ok: true, outline: { headings, controls: [{ role?, name, context? }], truncated? }, page?, pages?, targets: [{ id, label, description?, reveal?, visible, page?, onThisPage? }], count, truncated? }`. Outline caps: 60 controls, 30 headings, names clipped to 60 characters. Visible elements only; never field values, attributes or URLs.

## tour_dismiss

Input: none. Result: `{ ok: true, dismissed: true }`.

## tour_wait_for_interaction

Input: optional one of `target`, `selector`, `text`; `index`; `events`. No locator = the highlighted element.

| Result | Meaning |
|---|---|
| `{ ok: true, status: "interacted", event, target: { tag, name } }` | The user clicked / changed it. Never a field value. |
| `{ ok: true, status: "acknowledged" }` | User pressed Got it: read it, wants to continue. |
| `{ ok: true, status: "navigating" }` / `"dismissed"` | Answer to a page suggestion (Go / Not now, ×, Escape). |
| `{ ok: true, status: "timeout" }` / `"superseded"` | Not a failure: the user has not acted; call again or ask. |
| `no_step`, `cancelled`, `unavailable`, plus the locator errors above | Failures. |

Each call lasts about 20 s internally; hosts may cut at 30 s. If a call fails or returns after the page changed, check the page: the user most likely clicked.
