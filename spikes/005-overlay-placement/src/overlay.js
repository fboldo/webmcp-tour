// Spike 005 — throwaway overlay prototype. Not the library.
//
// createOverlay({ positioning, isolation })
//   positioning: "auto" (anchor if supported, else fixed) | "anchor" | "fixed"
//   isolation:   "shadow" (styles in a shadow root)  | "layer" (light DOM,
//                document.adoptedStyleSheets, everything in @layer webmcp-tour
//                — the plan as written)
//
// DOM: a host <div data-webmcp-tour-root> holding two popover="manual"
// elements — the spotlight ring and the card. Each is shown with
// showPopover({ source: target }), which makes the target its *implicit
// anchor*: no anchor-name is written onto the author's element.

const TOKENS = `
  --_surface: var(--tour-surface, Canvas);
  --_text: var(--tour-text, CanvasText);
  --_muted: var(--tour-muted, GrayText);
  --_radius: var(--tour-radius, 8px);
  --_shadow: var(--tour-shadow, 0 6px 24px rgb(0 0 0 / .25));
  --_dim: var(--tour-overlay-opacity, .35);
  --_ring: var(--tour-ring, AccentColor);
`;

// Rules shared by both isolation modes. `S` is the selector map.
function rules(S) {
  return `
${S.ring}, ${S.card} {
  ${TOKENS}
  color-scheme: light dark;
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  border: 0;
  box-sizing: border-box;
  overflow: visible;
  transition: opacity .15s ease, translate .15s ease;
}
${S.ring} {
  position-anchor: auto;
  top: anchor(top);
  left: anchor(left);
  bottom: anchor(bottom);
  right: anchor(right);
  width: auto;
  height: auto;
  background: transparent;
  pointer-events: none;
  border-radius: 4px;
  outline: 3px solid var(--_ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 9999px rgb(0 0 0 / var(--_dim));
  /* Chromium 159 deprecates the plural; Firefox 159 only knows the plural. */
  position-visibility: anchors-visible;
  position-visibility: anchor-visible;
}
${S.card} {
  position-anchor: auto;
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-inline, flip-block, flip-block flip-inline,
    block-end center, block-start center;
  /* When neither side fits (400% zoom), take the bigger side and scroll. */
  position-try-order: most-height;
  position-visibility: anchors-visible;
  position-visibility: anchor-visible;
  margin: 10px;
  width: max-content;
  max-width: min(22rem, calc(100vw - 20px));
  max-height: calc(100% - 20px); /* the position-area cell minus margins */
  overflow: auto;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
  grid-template-columns: 1fr auto;
  background: var(--_surface);
  color: var(--_text);
  border: 1px solid color-mix(in srgb, var(--_text) 25%, transparent);
  border-radius: var(--_radius);
  box-shadow: var(--_shadow);
  font: 14px/1.4 system-ui, sans-serif;
  text-align: start;
  pointer-events: auto;
}
${S.card}:not(:popover-open), ${S.ring}:not(:popover-open) { display: none; }
${S.attr} { grid-column: 1; font-size: 12px; color: var(--_muted); }
${S.title} { grid-column: 1 / -1; font-weight: 600; }
${S.msg} { grid-column: 1 / -1; white-space: pre-line; }
${S.close}, ${S.goto} {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--_text) 35%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
  margin: 0;
  cursor: pointer;
}
${S.close} { grid-column: 2; grid-row: 1; border: 0; line-height: 1; font-size: 18px; padding: 0 4px; }
${S.goto} { grid-column: 1 / -1; justify-self: start; margin-top: 6px; }

/* JS fixed-position fallback: the engine writes top/left/width/height. */
${S.ring}[data-fixed], ${S.card}[data-fixed] { position-anchor: none; position-area: none; position-try-fallbacks: none; }
${S.ring}[data-fixed] { right: auto; bottom: auto; }
${S.card}[data-fixed] { margin: 0; max-height: calc(100vh - 20px); }
${S.ring}[data-fixed][data-clipped], ${S.card}[data-fixed][data-clipped] { visibility: hidden; }

@media (prefers-reduced-motion: reduce) {
  ${S.ring}, ${S.card} { transition: none; }
}
@media (forced-colors: active) {
  ${S.ring} { outline: 3px solid Highlight; outline-offset: 2px; box-shadow: none; }
  ${S.card} { border: 2px solid CanvasText; background: Canvas; color: CanvasText; }
  ${S.close}, ${S.goto} { border-color: ButtonText; color: ButtonText; background: ButtonFace; }
}`;
}

const SHADOW_CSS = `
@layer webmcp-tour {
  /* Inner-context !important beats the page's !important on the host. */
  :host { all: initial !important; display: contents !important; }
  ${rules({
    ring: "[part~=spotlight]",
    card: "[part~=popover]",
    attr: "[part~=attribution]",
    title: "[part~=title]",
    msg: "[part~=message]",
    close: "[part~=close]",
    goto: "[part~=goto]",
  })}
}`;

const LAYER_CSS = `
@layer webmcp-tour {
  [data-webmcp-tour-root] { display: contents; }
  ${rules({
    ring: "[data-webmcp-tour-spotlight]",
    card: "[data-webmcp-tour-popover]",
    attr: "[data-webmcp-tour-attribution]",
    title: "[data-webmcp-tour-title]",
    msg: "[data-webmcp-tour-message]",
    close: "[data-webmcp-tour-close]",
    goto: "[data-webmcp-tour-goto]",
  })}
}`;

export function supportsAnchor() {
  return (
    typeof CSS !== "undefined" &&
    CSS.supports("anchor-name: --a") &&
    CSS.supports("position-anchor: auto") &&
    CSS.supports("position-try-fallbacks: flip-block")
  );
}

function el(tag, name, isolation) {
  const e = document.createElement(tag);
  if (isolation === "shadow") e.setAttribute("part", name);
  else e.setAttribute(`data-webmcp-tour-${name}`, "");
  return e;
}

export function createOverlay({ positioning = "auto", isolation = "shadow" } = {}) {
  const mode =
    positioning === "auto" ? (supportsAnchor() ? "anchor" : "fixed") : positioning;

  const host = document.createElement("div");
  host.setAttribute("data-webmcp-tour-root", "");
  let root = host;
  const sheet = new CSSStyleSheet();
  if (isolation === "shadow") {
    root = host.attachShadow({ mode: "open" }); // closed in the real thing
    sheet.replaceSync(SHADOW_CSS);
    root.adoptedStyleSheets = [sheet];
  } else {
    sheet.replaceSync(LAYER_CSS);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }

  const ring = el("div", "spotlight", isolation);
  const card = el("div", "popover", isolation);
  for (const p of [ring, card]) p.setAttribute("popover", "manual");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Assistant guidance");
  const attr = el("span", "attribution", isolation);
  attr.textContent = "From your assistant";
  const title = el("span", "title", isolation);
  const msg = el("span", "message", isolation);
  const close = el("button", "close", isolation);
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  const goto = el("button", "goto", isolation);
  goto.type = "button";
  goto.textContent = "Take me there";
  card.append(attr, close, title, msg, goto);
  root.append(ring, card);

  let target = null;
  let raf = 0;
  const stats = { updates: 0, closeClicks: 0 };

  close.addEventListener("click", () => {
    stats.closeClicks++;
    hide();
  });
  goto.addEventListener("click", () => target?.focus());

  // ---- fixed-position fallback -------------------------------------------
  function clipRect(t) {
    // Intersect the target rect with every clipping ancestor and the viewport.
    let r = t.getBoundingClientRect();
    let box = { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    for (let a = t.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const ar = a.getBoundingClientRect();
      box = {
        top: Math.max(box.top, ar.top),
        left: Math.max(box.left, ar.left),
        bottom: Math.min(box.bottom, ar.bottom),
        right: Math.min(box.right, ar.right),
      };
    }
    box.top = Math.max(box.top, 0);
    box.left = Math.max(box.left, 0);
    box.bottom = Math.min(box.bottom, innerHeight);
    box.right = Math.min(box.right, innerWidth);
    return { rect: r, visible: box.bottom > box.top && box.right > box.left };
  }

  function placeFixed() {
    raf = 0;
    if (!target) return;
    stats.updates++;
    const { rect: r, visible } = clipRect(target);
    for (const p of [ring, card]) p.toggleAttribute("data-clipped", !visible);
    Object.assign(ring.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    // Same rule as the CSS path (position-try-order: most-height): take the
    // roomier side, cap the card to it, let it scroll if it must.
    const gap = 10;
    const below = innerHeight - r.bottom - 2 * gap;
    const above = r.top - 2 * gap;
    const useBelow = below >= above;
    card.style.maxHeight = `${Math.max(useBelow ? below : above, 0)}px`;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const top = useBelow ? r.bottom + gap : r.top - gap - ch;
    const left = Math.min(Math.max(r.left, gap), Math.max(gap, innerWidth - cw - gap));
    Object.assign(card.style, { top: `${top}px`, left: `${left}px` });
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(placeFixed);
  }
  const ro = new ResizeObserver(schedule);

  function track(on) {
    const m = on ? "addEventListener" : "removeEventListener";
    // scroll does not bubble: capture catches every scroll container.
    document[m]("scroll", schedule, { capture: true, passive: true });
    window[m]("resize", schedule, { passive: true });
    if (on) {
      ro.observe(target);
      ro.observe(card);
    } else ro.disconnect();
  }

  // ---- public -------------------------------------------------------------
  // `mount` is a test hook: force a mount point (to show the inert case).
  function show(t, { title: ti = "", message = "", mount: forced } = {}) {
    hide();
    target = t;
    title.textContent = ti;
    msg.textContent = message;
    // Everything outside a showModal() dialog is inert: mount inside it.
    const mount = forced ?? t.closest("dialog:modal") ?? document.body;
    if (host.parentNode !== mount) mount.append(host);
    // Chromium remembers the last successful position-try option across
    // hide/show; re-inserting the nodes is what resets it.
    root.append(ring, card);
    for (const p of [ring, card]) {
      p.toggleAttribute("data-fixed", mode === "fixed");
      p.showPopover(mode === "anchor" ? { source: t } : undefined);
    }
    if (mode === "fixed") {
      track(true);
      placeFixed();
    }
    return { mode, isolation, mountedIn: mount.tagName.toLowerCase() };
  }

  function hide() {
    if (!target) return;
    if (mode === "fixed") track(false);
    if (raf) cancelAnimationFrame(raf), (raf = 0);
    for (const p of [ring, card]) if (p.matches(":popover-open")) p.hidePopover();
    target = null;
  }

  // Re-raise above anything that entered the top layer after us (e.g. a
  // dialog opened while the step is showing).
  function raise() {
    if (target) show(target, { title: title.textContent, message: msg.textContent });
  }

  return { show, hide, raise, mode, host, parts: { ring, card, close, goto, title, msg }, stats };
}
