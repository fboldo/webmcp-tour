import { expect } from "@playwright/test";

export async function open(page, query = {}) {
  const qs = new URLSearchParams(query).toString();
  await page.goto(`/fixtures/hostile.html${qs ? `?${qs}` : ""}`);
  await page.waitForSelector("html[data-ready]");
}

// Scroll the target into view, show the step, wait two frames.
export async function show(page, id, { block = "center", mount, message } = {}) {
  return page.evaluate(
    async ({ id, block, mount, message }) => {
      const t = document.getElementById(id);
      if (block) t.scrollIntoView({ block });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const info = spike.overlay.show(t, {
        title: "Change your plan",
        message: message ?? "Click here to pick a different plan.",
        mount: mount === "body" ? document.body : undefined,
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return info;
    },
    { id, block, mount, message },
  );
}

export const frames = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Geometry snapshot: target, ring, card rects + who wins the hit test at the
// card's centre (top-layer stacking and inertness both show up here).
export async function geom(page, id) {
  return page.evaluate((id) => {
    const o = spike.overlay;
    const R = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    const card = o.parts.card;
    const c = card.getBoundingClientRect();
    const hitEl = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
    return {
      target: R(document.getElementById(id)),
      ring: R(o.parts.ring),
      card: R(card),
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      cardOnTop: hitEl === o.host || o.host.contains(hitEl) || hitEl === card,
      cardOpen: card.matches(":popover-open"),
    };
  }, id);
}

export function expectRingOnTarget(g, tol = 1) {
  expect(Math.abs(g.ring.x - g.target.x), "ring x").toBeLessThanOrEqual(tol);
  expect(Math.abs(g.ring.y - g.target.y), "ring y").toBeLessThanOrEqual(tol);
  expect(Math.abs(g.ring.w - g.target.w), "ring w").toBeLessThanOrEqual(tol);
  expect(Math.abs(g.ring.h - g.target.h), "ring h").toBeLessThanOrEqual(tol);
}

export function expectCardPlaced(g) {
  const { card: c, target: t } = g;
  // Inside the viewport.
  expect(c.x, "card left in viewport").toBeGreaterThanOrEqual(0);
  expect(c.y, "card top in viewport").toBeGreaterThanOrEqual(0);
  expect(c.r, "card right in viewport").toBeLessThanOrEqual(g.vw);
  expect(c.b, "card bottom in viewport").toBeLessThanOrEqual(g.vh);
  // Not covering the target, and next to it (above or below, ≤ 12px gap).
  const overlaps = c.x < t.r && c.r > t.x && c.y < t.b && c.b > t.y;
  expect(overlaps, "card overlaps target").toBe(false);
  const gap = c.y >= t.b ? c.y - t.b : t.y - c.b;
  expect(gap, "card gap to target").toBeGreaterThanOrEqual(0);
  expect(gap, "card gap to target").toBeLessThanOrEqual(12);
}
