const FIELDS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/**
 * Rendered, non-zero and perceivable. Native form controls skip the opacity
 * check (custom checkboxes keep the real control at opacity:0). Boxes under
 * 4x4 px, sr-only clipping and boxes parked above/left of the document are
 * rejected, but such elements still contribute to their ancestors' names.
 */
export function isVisible(el: Element): boolean {
  const opacity = !FIELDS.has(el.tagName);
  if (
    !el.checkVisibility({
      checkOpacity: opacity,
      checkVisibilityCSS: true,
      opacityProperty: opacity,
      visibilityProperty: true,
    })
  )
    return false;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  if (r.width < 4 && r.height < 4) return false;
  const win = el.ownerDocument.defaultView!;
  if (r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) return false;
  const cs = getComputedStyle(el);
  return cs.clip !== "rect(0px, 0px, 0px, 0px)" && cs.clipPath !== "inset(50%)";
}
