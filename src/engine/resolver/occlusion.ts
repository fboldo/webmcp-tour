import { composedContains, OVERLAY_HOST_ATTR } from "./dom.js";
import type { Reveal } from "./types.js";

const inView = (r: DOMRect, win: Window): boolean =>
  r.bottom > 0 && r.top < win.innerHeight && r.right > 0 && r.left < win.innerWidth;

/** Hit-test the element's centre; true when something unrelated covers it. */
function covered(el: Element): boolean {
  const win = el.ownerDocument.defaultView!;
  const r = el.getBoundingClientRect();
  const x = (Math.max(r.left, 0) + Math.min(r.right, win.innerWidth)) / 2;
  const y = (Math.max(r.top, 0) + Math.min(r.bottom, win.innerHeight)) / 2;
  const root = el.getRootNode() as Document | ShadowRoot;
  const hit = root.elementsFromPoint(x, y).find((h) => !h.closest(`[${OVERLAY_HOST_ATTR}]`));
  if (!hit || hit === el || composedContains(el, hit) || composedContains(hit, el)) return false;
  return !(hit.localName === "label" && (hit as HTMLLabelElement).control === el);
}

/**
 * Scroll the element into view if needed, then hit-test it. When a fixed or
 * sticky element covers it, scroll it to the centre once and re-test.
 * The only DOM side effect of the resolver is this scrolling.
 */
export function reveal(el: Element): Reveal {
  const win = el.ownerDocument.defaultView!;
  const inViewport = inView(el.getBoundingClientRect(), win);
  const scroll = (block: ScrollLogicalPosition) => el.scrollIntoView({ block, inline: "nearest", behavior: "instant" });
  let scrolledIntoView = false;
  if (!inViewport) {
    scroll("nearest");
    scrolledIntoView = true;
  }
  const visibleNow = inView(el.getBoundingClientRect(), win);
  let occluded = visibleNow && covered(el);
  if (occluded) {
    scroll("center");
    scrolledIntoView = true;
    occluded = covered(el);
  }
  return { inViewport, scrolledIntoView, occluded };
}
