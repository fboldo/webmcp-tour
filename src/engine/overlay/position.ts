// Geometry helpers for the overlay: clip detection and the fixed-position
// fallback. Used in anchor mode only for the clip check (Firefox does not hide
// an anchor clipped by a scroll container); in fixed mode for all placement.

import type { Placement } from "./types.js";

const GAP = 10;

/** Containing-block-forming for absolutely positioned descendants. */
function isContainingBlock(cs: CSSStyleDeclaration): boolean {
  return cs.position !== "static" || cs.transform !== "none" || cs.filter !== "none";
}

/** True when the target has no visible area: clipped by an overflow ancestor or off-screen. */
export function isClipped(target: Element): boolean {
  const r = target.getBoundingClientRect();
  let { top, left, bottom, right } = r;
  const own = getComputedStyle(target).position;
  // Fixed targets ignore ancestor overflow; absolute ones only meet clippers
  // from their containing block upwards.
  let skipping = own === "absolute";
  if (own !== "fixed") {
    for (let a = target.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (skipping) {
        if (!isContainingBlock(cs)) continue;
        skipping = false;
      }
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const ar = a.getBoundingClientRect();
      top = Math.max(top, ar.top);
      left = Math.max(left, ar.left);
      bottom = Math.min(bottom, ar.bottom);
      right = Math.min(right, ar.right);
    }
  }
  top = Math.max(top, 0);
  left = Math.max(left, 0);
  bottom = Math.min(bottom, innerHeight);
  right = Math.min(right, innerWidth);
  return !(bottom > top && right > left) && (r.width > 0 || r.height > 0);
}

/** Largest deviation (px) between two rects. */
export function drift(a: DOMRect, b: DOMRect): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height),
  );
}

/**
 * Writes top/left/width/height (CSSOM: CSP-safe) for ring and card. Same rule
 * as the CSS path: preferred side when the card fits, else the roomier side,
 * capped to it so the content scrolls rather than covering the target.
 */
export function placeFixed(target: Element, ring: HTMLElement, card: HTMLElement, placement: Placement): void {
  const r = target.getBoundingClientRect();
  ring.style.top = `${r.top}px`;
  ring.style.left = `${r.left}px`;
  ring.style.width = `${r.width}px`;
  ring.style.height = `${r.height}px`;

  const below = innerHeight - r.bottom - 2 * GAP;
  const above = r.top - 2 * GAP;
  card.style.maxHeight = "";
  const natural = card.offsetHeight;
  const useBelow =
    placement === "above" ? !(above >= natural) && below > above : below >= natural || below >= above;
  card.style.maxHeight = `${Math.max(useBelow ? below : above, 0)}px`;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  card.style.top = `${useBelow ? r.bottom + GAP : r.top - GAP - ch}px`;
  card.style.left = `${Math.min(Math.max(r.left, GAP), Math.max(GAP, innerWidth - cw - GAP))}px`;
}

/** Drop everything placeFixed wrote. */
export function clearFixed(...els: HTMLElement[]): void {
  for (const e of els) for (const p of ["top", "left", "width", "height", "max-height"]) e.style.removeProperty(p);
}
