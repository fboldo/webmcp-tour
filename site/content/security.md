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

- `selector` matches **visible** elements only, and it can say only *where* an element is, never what a hidden element holds. Selectors that test attribute values (`[attr^=…]`, `$=`, `*=`, `~=`, `|=`, anything on `value`) or use `:has()` are refused with `invalid_input`, because "found / not found" would otherwise answer questions about content the user cannot see, one character at a time. Plain `[attr=name]`, ids, classes and tags still work; the error tells the agent to use `text` or `target`.
- Results carry only visible names, clipped in count and length: up to 8 `near` names, 10 `candidates`, 50 `available` ids, 60 outline controls. They never carry field values (password, hidden inputs and text fields included) or attribute values.
- Names come from the accessible name of visible elements. `aria-hidden`, `inert`, `data-tour-exclude`, the `exclude` option, the `scope` option and the tour's own overlay are never searched, and excluded content does not leak: not through an element's text, not through the row or heading context of an ambiguous match or of the outline, and not through `aria-labelledby` pointing at an excluded node.
- **What a person typed is never a name.** `input`, `textarea`, `select`, `contenteditable` and `role=textbox|searchbox|combobox|spinbutton` are named only by `aria-label`, `aria-labelledby`, a `<label>`, `title` or `placeholder`. A rich-text editor's content does not reach the agent.
- `tour_wait_for_interaction` reports the element (tag and name) and the kind of event, never a value, and ignores `input` events.
- `tour_list_targets` is annotated `untrustedContentHint: true`: the text in it is the page's own.

Mark whatever must not be pointed at with `data-tour-exclude` (or `exclude`): delete workspace, a secret reveal. Use `scope` to limit the tour to part of the page, and `locators: { selector: false }` to allow only declared ids and visible text.

## Markup from your users

`data-tour-*` attributes are page markup. HTML sanitisers allow `data-*` attributes by default (DOMPurify's `ALLOW_DATA_ATTR` is `true`), so a comment, profile or support ticket you render could carry `data-tour-id`, `data-tour-description` or `data-tour-page`. The library defends itself in three ways:

- An id declared on more than one element is **ambiguous**: pointing at it returns `ambiguous_target` with every match listed (up to 10), it is left out of `tour_list_targets`, and the console warns once. Earlier markup cannot take over a target.
- DOM targets are read only inside `scope` when you set one.
- `domTargets: false` ignores `data-tour-*` markup altogether; only `defineTarget` targets exist.

If your site renders user-written HTML, also strip the attributes in the sanitiser and declare your targets in code:

```js
// DOMPurify
DOMPurify.sanitize(html, { FORBID_ATTR: ["data-tour-id", "data-tour-label", "data-tour-description", "data-tour-reveal", "data-tour-page", "data-tour-exclude"] });
// or, to drop every data-tour-* attribute:
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName.startsWith("data-tour-")) data.keepAttr = false;
});

tour.defineTarget({ id: "change-plan", selector: "#change-plan" });
```

A description shown on a card is still the page's text, shown under the assistant's label; treat `data-tour-description` as content that only your own templates should produce.

## Where the code runs

- No network requests, no storage except the one-use resume entry in `sessionStorage`, no cookies, no dependencies, no telemetry.
- The overlay is an open shadow root, so page CSS cannot restyle it by accident. Its stylesheet is adopted with `adoptedStyleSheets`, which is CSP-safe under `style-src 'self'` (no `unsafe-inline`). It is tested against such a header.
- The script-tag build sets `window.webmcpTour`, which any same-origin script can use to drive the overlay. Add `data-no-global` to the script tag to opt out; the tours you create stay private to your code.
- There are no `unload` listeners (they would cost the back/forward cache).
- Where WebMCP is missing the library registers nothing and says why in one `console.info`.

## What stays your responsibility

- **Descriptions and labels are shown to agents** (`tour_list_targets`) and users. Do not put secrets in them.
- **`interacted` is not proof of a human.** A CDP-driven agent click is a trusted event. Do not use the wait result to authorise anything.
- WebMCP itself decides which agents can call the page's tools and what a user must approve. This library does not add authentication.
- The demo's optional OpenRouter mode sends a key the user types to `openrouter.ai`, and nothing else leaves the page. It is part of the demo, not the library.
