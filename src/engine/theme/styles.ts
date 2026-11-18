// Overlay stylesheet. Shipped through `adoptedStyleSheets` on the shadow root,
// which is CSP-safe under `style-src 'self'`. Defaults are system colours; the
// `--tour-*` custom properties on the host (they inherit into the shadow tree)
// are the documented tokens, `part` names the documented hack surface.

const ALL = "[part~=spotlight],[part~=popover]";
const BTN = "[part~=close],[part~=goto]";
const ANCHOR_VISIBLE =
  // Chromium deprecated the plural; Firefox only parses the plural.
  "position-visibility:anchors-visible;position-visibility:anchor-visible;";

export const CSS = `
@layer webmcp-tour{
:host{all:initial!important;display:contents!important}
${ALL}{
--_surface:var(--tour-surface,Canvas);
--_text:var(--tour-text,CanvasText);
--_muted:var(--tour-muted,color-mix(in srgb,CanvasText 72%,Canvas));
--_radius:var(--tour-radius,8px);
--_shadow:var(--tour-shadow,0 6px 24px rgb(0 0 0/.25));
--_dim:var(--tour-overlay-opacity,.35);
--_ring:var(--tour-ring,AccentColor);
color-scheme:light dark;position:fixed;inset:auto;margin:0;padding:0;border:0;
box-sizing:border-box;overflow:visible;
transition:opacity .15s ease,translate .15s ease}
[part~=spotlight]{position-anchor:auto;top:anchor(top);left:anchor(left);
bottom:anchor(bottom);right:anchor(right);width:auto;height:auto;
background:transparent;pointer-events:none;border-radius:4px;
outline:3px solid var(--_ring);outline-offset:2px;
box-shadow:0 0 0 9999px rgb(0 0 0/var(--_dim));${ANCHOR_VISIBLE}}
[part~=popover]{position-anchor:auto;position-area:block-end span-inline-end;
position-try-fallbacks:flip-inline,flip-block,flip-block flip-inline,block-end center,block-start center;
position-try-order:most-height;${ANCHOR_VISIBLE}
margin:10px;width:max-content;max-width:min(22rem,calc(100vw - 20px));
max-height:calc(100% - 20px);overflow:auto;padding:12px 14px;display:grid;gap:4px;
grid-template-columns:1fr auto;background:var(--_surface);color:var(--_text);
border:1px solid color-mix(in srgb,var(--_text) 25%,transparent);
border-radius:var(--_radius);box-shadow:var(--_shadow);font:14px/1.4 system-ui,sans-serif;
text-align:start;pointer-events:auto}
[part~=popover][data-placement=above]{position-area:block-start span-inline-end;position-try-order:normal}
[part~=popover][data-placement=below]{position-area:block-end span-inline-end;position-try-order:normal}
[part~=spotlight]:not(:popover-open),[part~=popover]:not(:popover-open){display:none}
[part~=attribution]{grid-column:1;font-size:12px;color:var(--_muted)}
[part~=title]{grid-column:1/-1;font-weight:600}
[part~=message]{grid-column:1/-1;white-space:pre-line}
${BTN}{font:inherit;color:inherit;background:transparent;
border:1px solid color-mix(in srgb,var(--_text) 35%,transparent);
border-radius:6px;padding:2px 8px;margin:0;cursor:pointer}
[part~=close]{grid-column:2;grid-row:1;border:0;line-height:1;font-size:18px;padding:0 4px}
[part~=goto]{grid-column:1/-1;justify-self:start;margin-top:6px}
[part~=live]{position:fixed;top:0;left:0;contain:strict;width:1px;height:1px;margin:0;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[part~=title]:empty,[part~=message]:empty{display:none}
/* JS fixed-position path: the engine writes top/left/width/height. */
[part][data-fixed]{position-anchor:none;position-area:none;position-try-fallbacks:none}
[part~=spotlight][data-fixed]{right:auto;bottom:auto}
[part~=popover][data-fixed]{margin:0;max-height:calc(100vh - 20px)}
[part][data-clipped]{visibility:hidden}
/* Small viewports and 400% zoom: actions first, so they never land below the fold. */
@media (max-width:480px),(max-height:420px){
[part~=popover]{padding:8px 10px;gap:2px;font-size:13px}
[part~=goto]{grid-row:2;margin-top:2px}
[part~=title]{grid-row:3}
[part~=message]{grid-row:4}}
@media (prefers-reduced-motion:reduce){${ALL}{transition:none}}
@media (forced-colors:active){
[part~=spotlight]{outline:3px solid Highlight;outline-offset:2px;box-shadow:none}
[part~=popover]{border:2px solid CanvasText;background:Canvas;color:CanvasText}
${BTN}{border-color:ButtonText;color:ButtonText;background:ButtonFace}}
}`;

/** One constructable sheet per call; adopt it on the shadow root. */
export function createSheet(): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  return sheet;
}
