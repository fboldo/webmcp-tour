// Ported from spike 005: forced-colors, reduced motion, 400% zoom.
import { afterEach, describe, expect, it } from "vitest";
import { cardPlaced, cleanup, emulateMedia, geom, openFixture, overlaps, parts, ringOnTarget } from "./helpers.js";

afterEach(cleanup);

describe("media emulation", () => {
  it("forced-colors: ring becomes a Highlight outline, dimming dropped", async () => {
    await emulateMedia({ forcedColors: "active" });
    const fx = await openFixture();
    expect(fx.win.matchMedia("(forced-colors: active)").matches).toBe(true);
    await fx.show("t-plain");
    const probe = fx.doc.createElement("div");
    probe.style.color = "Highlight"; // CSSOM write: allowed under CSP
    fx.doc.body.append(probe);
    const highlight = fx.win.getComputedStyle(probe).color;
    const cs = fx.win.getComputedStyle(parts(fx).ring);
    expect(cs.outlineStyle).toBe("solid");
    expect(cs.outlineWidth).toBe("3px");
    expect(cs.outlineColor).toBe(highlight);
    expect(cs.boxShadow).toBe("none");
  });

  it("prefers-reduced-motion: no transitions", async () => {
    await emulateMedia({ reducedMotion: "reduce" });
    const fx = await openFixture();
    await fx.show("t-plain");
    const { ring, card } = parts(fx);
    expect([ring, card].map((e) => fx.win.getComputedStyle(e).transitionDuration)).toEqual(["0s", "0s"]);
  });

  it("default motion: short transitions on", async () => {
    const fx = await openFixture();
    await fx.show("t-plain");
    expect(fx.win.getComputedStyle(parts(fx).card).transitionDuration).not.toBe("0s");
  });
});

// 400% zoom of a 1280×1024 window = a 320×256 CSS px viewport (WCAG 1.4.10 reflow).
// Emulated by sizing the fixture iframe; layout depends on CSS px only.
describe("400% zoom (320×256 CSS px)", () => {
  for (const positioning of ["anchor", "fixed"])
    for (const id of ["t-plain", "t-header", "t-bottom"])
      it(`${positioning}: card fits beside ${id} without covering it (content may scroll)`, async () => {
        const fx = await openFixture({ query: `positioning=${positioning}`, width: 320, height: 256 });
        await fx.show(id, {
          message: "Open the plan picker, choose a plan, then confirm. Your card is charged on the next cycle.",
        });
        const g = geom(fx, id);
        const { card } = parts(fx);
        expect(ringOnTarget(g)).toBe(true);
        expect(g.card.x).toBeGreaterThanOrEqual(0);
        expect(g.card.r).toBeLessThanOrEqual(g.vw);
        expect(g.card.y).toBeGreaterThanOrEqual(0);
        expect(g.card.b).toBeLessThanOrEqual(g.vh);
        expect(card.scrollWidth, "no horizontal clipping of text").toBeLessThanOrEqual(card.clientWidth);
        expect(overlaps(g.card, g.target), "card must not cover the target").toBe(false);
        expect(g.cardOnTop).toBe(true);
        expect(cardPlaced(g).why).not.toContain("outside viewport");
      });
});
