# Spike 005 — overlay placement

**Verdict: PARTIAL.** The top layer, CSS anchor positioning and
`adoptedStyleSheets` work together. The overlay stays anchored and on top, and
the strict CSP reports no violations. One plan assumption is **INVALIDATED**:
`@layer webmcp-tour` does not protect the overlay from page CSS. It does the
opposite. A shadow root fixes it. Several smaller plan changes are listed below.

Throwaway code. Nothing here is library code.

## Question

Do the top layer (`popover="manual"`), CSS anchor positioning and
`adoptedStyleSheets` hold up together on hostile pages? The plan's Theme and
Accessibility sections assume they do.

**Given** hostile pages (an open modal dialog, forced colours, a CSP without
`'unsafe-inline'`, scroll containers), **when** the overlay shows, **then** it
stays anchored, legible and CSP-clean.

## Method

- `src/overlay.js`: a prototype with a spotlight ring (`pointer-events: none`)
  and a card. Two switches:
  - `positioning`: `anchor` (CSS anchor positioning) or `fixed` (JS fallback:
    capture-phase scroll, `ResizeObserver` and rAF).
  - `isolation`: `shadow` (shadow root plus adopted sheet) or `layer` (light
    DOM, `document.adoptedStyleSheets`, everything in `@layer webmcp-tour`,
    as the plan says).
- It also has `prefers-reduced-motion`, a `forced-colors` outline in
  `Highlight`, and mounting inside `dialog:modal`.
- `fixtures/hostile.html` is served by `server.mjs` with a **real
  `Content-Security-Policy` header**:
  `default-src 'none'; script-src 'self'; style-src 'self'; …`. It has no
  `'unsafe-inline'`. Every test runs under it. The page contains:
  - a sticky header
  - a `position: fixed; z-index: 2147483647` banner
  - nested scroll containers
  - an ancestor with `translate + scale(.75) + rotate(-4deg)`
  - an ancestor with `contain: paint` + `filter` + `will-change`
  - a `<dialog>` opened with `showModal()`
  - Tailwind v3 preflight (unlayered, as compiled)
  - optionally `hostile.css`: `div:empty{display:none!important}`,
    `button{background:hotpink!important;padding:20px!important}`,
    `[popover]{inset:0;padding:40px;border:dashed}`, `span{display:block}`,
    `*{transition:all 1s}`
- Playwright 1.65.1 runs geometry assertions (ring rect equals the target
  rect within 1 px; card inside the viewport, not over the target, gap ≤ 12 px)
  and hit tests (`elementFromPoint`).
  - Browsers: Chromium 159.0.8154.6 and Firefox 159.0.
  - Emulation: forced colours, reduced motion, and 400% zoom (a 320×256 CSS px
    viewport at DPR 4, the WCAG 1.4.10 reflow case).
  - **WebKit was not run.** It cannot launch on this host because
    `libavif16` is missing and installing it needs sudo.

```sh
cd spikes/005-overlay-placement
npm install && npx playwright install chromium firefox
npx playwright test          # 90 passed (45 per browser)
npx playwright test --repeat-each 2   # 180 passed, twice — no flakes
```

Two tests are marked `test.fail`. They record a known Firefox difference and
pass because they fail as expected. Screenshots are written to
`test-results/shots/`. Key ones are copied to `screenshots/`.

## Results

| Case | anchor (Chromium) | anchor (Firefox) | fixed fallback (both) |
|---|---|---|---|
| Plain, sticky header, `contain`/`filter`/`will-change` ancestor, bottom of page | ✅ exact | ✅ exact | ✅ exact |
| Nested scroll + window scroll + resize after show | ✅ with **zero JS updates** | ✅ zero JS updates | ✅ (capture scroll + RO + rAF) |
| Target clipped by its scroll container → hide | ✅ `position-visibility` | ❌ not hidden (see 5) | ✅ JS clip check |
| Transformed ancestor | ✅ ring = transformed bounding box | ❌ ring = **untransformed** box (off by 5–17 px) | ✅ |
| `z-index: 2147483647` fixed banner | ✅ top layer wins | ✅ | ✅ |
| Target in `showModal()` dialog, overlay mounted in the dialog | ✅ on top, close button clickable | ✅ | ✅ |
| Control: overlay mounted on `<body>` while the modal is open | draws, but **inert** (hit test misses, click does nothing) | same | same |
| CSP: zero `securitypolicyviolation`, adopted sheet applied | ✅ | ✅ | ✅ (CSSOM `el.style.*` writes allowed) |
| Negative control: injected `<style>` and `style=""` blocked | ✅ blocked + 2 violations | ✅ | — |
| Forced colours: outline `3px solid` = resolved `Highlight`, `box-shadow: none` | ✅ | ✅ | ✅ |
| Reduced motion: `transition-duration: 0s` | ✅ | ✅ | ✅ |
| 400% zoom: card in viewport, not covering the target, no horizontal overflow | ✅ but the **card scrolls** | ✅ card scrolls | ✅ card scrolls |
| `isolation=shadow` on preflight + hostile CSS | ✅ untouched | ✅ | ✅ |
| `isolation=layer` (plan as written) on preflight CSS | ❌ card border 0 | ❌ | ❌ |
| `isolation=layer` on hostile CSS | ❌ spotlight `display:none`, hotpink buttons, card padding 40 px with a dashed border | ❌ | ❌ |

Evidence for the less obvious rows:

1. **Implicit anchors work with no change to the author's DOM.**
   `showPopover({ source: target })` makes the target the implicit anchor in
   both engines, so no `anchor-name` is written onto the author's element. You
   must set **`position-anchor: auto`** explicitly. Its initial value is
   `none` in both Chromium 159 and Firefox 159, so without it the popover sits
   at (0, 0). The Chromium accessibility tree of the target is the same before,
   during and after: no `expanded` or `details` leaks onto it (checked with CDP
   `Accessibility.getPartialAXTree`).
2. **Chromium keeps the card on its last side.** After the card flips above
   for one target, the next `show()` keeps it above even when there is room
   below (card `y = 10`, target bottom `164.5`). Toggling
   `position-try-fallbacks` does not reset it. Re-inserting the popover nodes
   does. Firefox does not do this. Test: "sequential shows do not inherit the
   previous flip".
3. **`@layer` loses to unlayered page CSS.**
   - Cascade layers rank *below* unlayered author styles, whatever the
     specificity. Tailwind v3 compiles preflight unlayered, and so does most
     legacy CSS.
   - Preflight's `*{border-width:0}` removes the card border. Probe values:
     `cardBorderWidth: "0px"`.
   - `hostile.css` removes the spotlight (`div:empty`) and restyles the card
     and buttons. Probe values: `ringDisplay: "none"`,
     `closeBg: "rgb(255, 105, 180)"`, `cardPadding: "40px"`.
   - See `screenshots/isolation-layer-hostile-chromium.png` and
     `isolation-shadow-hostile-chromium.png`.
   - The shadow variant blocks all of it. Page selectors cannot enter the
     shadow tree. For the host element itself, `:host { all: initial
     !important; display: contents !important }` wins, because `!important`
     from the inner (shadow) context beats `!important` from the outer page
     (CSS Cascade 5, context step).
4. **Transforms behave differently.**
   - Chromium's `anchor()` follows the transformed bounding box. Firefox does
     not: target `{x:180.2, y:367.6, w:57.5, h:32.7}`, ring
     `{x:174.9, y:378.8, w:74.2, h:38.5}`.
   - See `screenshots/transform-anchor-firefox.png`: the undimmed "hole" sits
     beside the button.
5. **`position-visibility` keyword differs by engine.**
   - Chromium 159 deprecates `anchors-visible` (console warning) in favour of
     `anchor-visible`.
   - Firefox 159 parses only `anchors-visible`, and even then does not hide the
     card when the anchor is clipped by a scroll container.
   - The prototype declares both values.
6. **At 400% zoom the card needs to scroll.**
   - With `position-try-order: most-height` and
     `max-height: calc(100% - 20px)`, the card sits on the roomier side, in
     the viewport, beside the target, and its content scrolls.
   - At 400% that means "Take me there" is below the fold of the card
     (`screenshots/zoom400-anchor-chromium.png`).
   - Before this change, the fixed fallback clamped the card *over* the target
     and the anchor path overflowed the viewport.
7. **The top layer draws over occluders, but clicks don't reach the target.**
   - The ring is drawn on top of anything that covers the target, such as a
     fixed banner or a sticky header. The user then cannot click what is
     highlighted (`screenshots/zindex-anchor-chromium.png`: ring around a
     button hidden under the cookie banner).
   - Nothing in the plan detects this.
8. **A modal opened *after* the step covers the overlay.**
   - It enters the top layer above the overlay.
   - Re-showing raises the overlay again, but the overlay then sits outside
     the modal and is inert. The target is inert too.

## Plan changes

1. **Theme, tier 2: replace "isolated in `@layer webmcp-tour`" with a shadow
   root.**
   - Put `adoptedStyleSheets` on the shadow root, plus
     `:host { all: initial !important; display: contents !important }`.
   - The documented DOM becomes `part` names (`::part(popover)`,
     `::part(spotlight)`, …) plus the custom-property tokens. Tokens inherit
     into the shadow tree.
   - `data-webmcp-tour-root` stays only on the host.
   - Author `::part()` rules win over ours (outer context), which is the
     intended hack surface.
   - `@layer` inside the shadow tree is harmless but no longer the isolation
     mechanism. Drop the review's `all: revert-layer` idea, because
     `revert-layer` cannot beat unlayered styles.
2. **Default DOM: use two `popover="manual"` elements, not one root popover.**
   - The spotlight and the card are separate popovers inside the shadow root,
     each shown with `showPopover({ source: target })`. The implicit anchor
     applies only to the popover itself, so a single root popover cannot
     anchor its children without writing `anchor-name` onto the author's
     element.
   - Set `position-anchor: auto` explicitly.
   - Re-insert the popover nodes on every `show()` to reset Chromium's
     remembered fallback.
3. **"Auto" positioning should be anchor plus a self-check, not only feature
   detection.**
   - Firefox 159 now *supports* anchor positioning, but differs on transforms
     and clipping.
   - After showing, compare the ring rect to `target.getBoundingClientRect()`.
     If they differ by more than 1 px, switch that step to the fixed path.
   - Keep a cheap capture-phase scroll clip check in anchor mode as well,
     because Firefox's `position-visibility` does not hide clipped anchors.
   - Declare both `anchors-visible` and `anchor-visible`.
4. **Position tracking: in anchor mode, nested and window scroll and resize
   needed zero JS in both engines.** Capture scroll + `ResizeObserver` + rAF is
   only for the fixed fallback (and the Firefox clip check). The plan's
   sentence should say so.
5. **Dialog mounting: VALIDATED.** The engine also needs a policy for a modal
   that opens after `show()`. Proposal: dismiss with `superseded`/`obscured`
   rather than re-raise, because the target is now inert. Detecting it still
   needs a mechanism; candidates are the dialog `toggle` event or observing
   `[open]`. This was not tested here.
6. **New: occlusion check.** After scrolling into view, hit-test the target
   (`elementsFromPoint` at its centre). If a fixed or sticky element covers
   it, scroll by the occluder's height or return an `occluded` status in the
   envelope. Without this, the top layer happily rings a button the user
   cannot click.
7. **Accessibility, 400% zoom: PARTIAL.** The card stays beside the target and
   scrolls, but the actions end up below the fold. M3 should add a compact
   layout at small viewports, for example actions before the message, or a
   sticky action row.
8. **CSP: VALIDATED for Chromium and Firefox.** Constructable sheets and CSSOM
   writes are not blocked by `style-src 'self'`. The `nonce` fallback is not
   needed for these engines. Keep it only if WebKit testing shows otherwise.

## Caveats

- Tests drive the overlay with `page.evaluate`, which bypasses CSP for
  *script*. Style paths are still enforced: the negative control shows
  injected `<style>` and `style=""` being blocked.
- 400% zoom is emulated as a 320×256 CSS px viewport at DPR 4, not with the
  browser's zoom control.
- WebKit is untested, and so is real Chrome with the WebMCP flag. Neither
  matters to placement logic, but WebKit's anchor-positioning quirks are
  unknown.

## Files

- `server.mjs` — static server with the CSP header
- `src/overlay.js` — the prototype
- `fixtures/` — the hostile page, CSS and harness
- `tests/` — Playwright specs
- `screenshots/` — key captures
