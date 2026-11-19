---
title: Security and privacy
description: What webmcp-tour does to keep a page safe from a misbehaving agent or a crafted link, and what it never reads or sends.
order: 6
---

The library has one job: draw a highlight and a card. The defaults are built so that neither a mistaken agent nor a hostile one can use it to hurt the user or to read the page.

## It cannot act

- Every tool is annotated `readOnlyHint: true`. Nothing clicks, types, submits or changes a page.
- Navigation happens only when the **user** presses **Go** on a suggestion card. A tool call never navigates.
- The page can keep its own consequential tools separate; pointing is not authority to act.

## It cannot pass text off as the site's own

- The card always says **From your assistant** (configurable through `labels.attribution`, but never removed), and the card's aria label is the same. A page that shows agent text next to its own UI makes clear whose words they are.
- Titles and messages are **plain text**: they are set as `textContent`, never parsed as HTML. Labels the same. Limits are 80 characters for a title, 500 for a message.
- A resumed step cannot be forged with a link. Only a random nonce travels in the URL; the step is kept in this tab's `sessionStorage` and used once, within 2 minutes. A crafted link with an unknown, expired or used nonce shows nothing ([Concepts](concepts.md)).
- A custom `renderPopover` hook is your code: you own its escaping.

## It cannot be used to read the page

- `selector` matches **visible** elements only. A selector that hits a hidden element looks exactly like no match, so it is no oracle for what exists in the DOM.
- Results carry only visible names, clipped in count and length: up to 8 `near` names, 10 `candidates`, 50 `available` ids, 60 outline controls. They never carry field values (password, hidden inputs and text fields included) or attribute values.
- Names come from the accessible name of visible elements. `aria-hidden`, `inert`, `data-tour-exclude`, the `exclude` option, the `scope` option and the tour's own overlay are never searched, and excluded content inside an element does not leak through that element's text.
- `tour_wait_for_interaction` reports the element (tag and name) and the kind of event, never a value, and ignores `input` events.
- `tour_list_targets` is annotated `untrustedContentHint: true`: the text in it is the page's own.

Mark whatever must not be pointed at with `data-tour-exclude` (or `exclude`): delete workspace, a secret reveal. Use `scope` to limit the tour to part of the page, and `locators: { selector: false }` to allow only declared ids and visible text.

## Where the code runs

- No network requests, no storage except the one-use resume entry in `sessionStorage`, no cookies, no dependencies, no telemetry.
- The overlay is an open shadow root, so page CSS cannot restyle it by accident. Its stylesheet is adopted with `adoptedStyleSheets`, which is CSP-safe under `style-src 'self'` (no `unsafe-inline`). It is tested against such a header.
- The script-tag build sets `window.webmcpTour`, which any same-origin script can use to drive the overlay. Add `data-no-global` to the script tag to opt out; the tour stays reachable only through the `Symbol.for("webmcp-tour")` singleton on `globalThis`.
- There are no `unload` listeners (they would cost the back/forward cache).
- Where WebMCP is missing the library registers nothing and says why in one `console.info`.

## What stays your responsibility

- **Descriptions and labels are shown to agents** (`tour_list_targets`) and users. Do not put secrets in them.
- **`interacted` is not proof of a human.** A CDP-driven agent click is a trusted event. Do not use the wait result to authorise anything.
- WebMCP itself decides which agents can call the page's tools and what a user must approve. This library does not add authentication.
- The demo's optional OpenRouter mode sends a key the user types to `openrouter.ai`, and nothing else leaves the page. It is part of the demo, not the library.
