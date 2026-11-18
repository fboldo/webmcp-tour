// Ported from spike 005: placement on hostile pages, both positioning paths.
import { afterEach, describe, expect, it } from "vitest";
import { cardPlaced, cleanup, geom, openFixture, parts, ringOnTarget } from "./helpers.js";

afterEach(cleanup);

for (const positioning of ["anchor", "fixed"] as const) {
  describe(`positioning=${positioning}`, () => {
    const open = (query = "") => openFixture({ query: `positioning=${positioning}&${query}` });

    for (const id of ["t-plain", "t-header", "t-scroll", "t-contained", "t-bottom"]) {
      it(`ring and card placed on ${id}`, async () => {
        const fx = await open();
        const res = await fx.show(id);
        expect(res).toMatchObject({ shown: true, positioning });
        const g = geom(fx, id);
        expect(ringOnTarget(g), JSON.stringify(g)).toBe(true);
        expect(cardPlaced(g)).toEqual({ ok: true, why: "" });
        expect(g.cardOnTop, "card wins the hit test").toBe(true);
      });
    }

    it("sequential shows do not inherit the previous flip", async () => {
      const fx = await open();
      await fx.show("t-bottom", { block: "end" });
      const g1 = geom(fx, "t-bottom");
      expect(g1.card.b, "flipped above").toBeLessThanOrEqual(g1.target.y);
      await fx.show("t-plain");
      const g2 = geom(fx, "t-plain");
      expect(ringOnTarget(g2)).toBe(true);
      expect(g2.card.y, "back below").toBeGreaterThanOrEqual(g2.target.b);
    });

    it("tracks nested + window scroll and resize", async () => {
      const fx = await open();
      await fx.show("t-scroll");
      fx.el("inner").scrollTop -= 25;
      fx.el("outer").scrollTop -= 15;
      fx.win.scrollBy(0, 70);
      await fx.frames();
      let g = geom(fx, "t-scroll");
      expect(ringOnTarget(g), "after scroll").toBe(true);
      expect(cardPlaced(g).ok).toBe(true);
      // Resize the document by resizing its iframe.
      (fx.doc.defaultView!.frameElement as HTMLElement).style.width = "700px";
      await fx.frames();
      g = geom(fx, "t-scroll");
      expect(ringOnTarget(g), "after resize").toBe(true);
      expect(cardPlaced(g).ok).toBe(true);
      // Anchor mode tracks with zero JS writes; fixed mode writes inline geometry.
      const { ring } = parts(fx);
      expect(ring.style.top !== "").toBe(positioning === "fixed");
    });

    it("hides when the target is clipped by its scroll container, returns when scrolled back", async () => {
      const fx = await open();
      await fx.show("t-scroll");
      fx.el("inner").scrollTop = 0;
      await fx.frames(3);
      const { ring, card } = parts(fx);
      expect(fx.win.getComputedStyle(card).visibility).toBe("hidden");
      expect(fx.win.getComputedStyle(ring).visibility).toBe("hidden");
      fx.el("t-scroll").scrollIntoView({ block: "center" });
      await fx.frames(3);
      expect(fx.win.getComputedStyle(card).visibility).toBe("visible");
      expect(geom(fx, "t-scroll").cardOnTop).toBe(true);
    });

    it("top layer beats a z-index: 2147483647 fixed banner", async () => {
      const fx = await open();
      fx.el("banner").style.height = "55vh"; // CSSOM: CSP-safe
      const t = fx.el("t-bottom");
      fx.win.scrollBy(0, t.getBoundingClientRect().bottom - fx.win.innerHeight * 0.5);
      await fx.show("t-bottom", { block: null, message: "Line one.\nLine two.\nLine three.\nLine four." });
      const g = geom(fx, "t-bottom");
      const bannerTop = fx.el("banner").getBoundingClientRect().top;
      expect(g.ring.b, "ring sits on the banner area").toBeGreaterThan(bannerTop);
      const probeY = Math.max(g.card.y, bannerTop) + 4;
      expect(probeY, "card reaches the banner").toBeLessThan(g.card.b);
      expect(fx.doc.elementFromPoint(g.card.x + 20, probeY)).toBe(fx.overlay.host);
    });
  });
}

describe("auto positioning and the post-show self-check", () => {
  it("transformed ancestor: ring ends up on the target's real box, whichever path was taken", async () => {
    const fx = await openFixture();
    const res = await fx.show("t-transform");
    const g = geom(fx, "t-transform");
    expect(res.shown).toBe(true);
    expect(ringOnTarget(g), `${res.positioning} ${JSON.stringify(g)}`).toBe(true);
    // Firefox's anchor() uses the untransformed box (5-17 px off): the check must switch that step to fixed.
    if (navigator.userAgent.includes("Firefox")) expect(res.positioning).toBe("fixed");
    else expect(res.positioning).toBe("anchor");
  });

  it("a step on a normal target keeps anchor positioning and the next step is re-evaluated", async () => {
    const fx = await openFixture();
    expect((await fx.show("t-transform")).positioning).toMatch(/anchor|fixed/);
    const res = await fx.show("t-plain");
    expect(res.positioning).toBe("anchor");
    const { ring, card } = parts(fx);
    expect(ring.hasAttribute("data-fixed") || card.hasAttribute("data-fixed")).toBe(false);
    expect(ring.style.top).toBe("");
  });

  it("explicit placement: above puts the card above when it fits", async () => {
    for (const positioning of ["anchor", "fixed"]) {
      const g = await openFixture({ query: `positioning=${positioning}` });
      await g.show("t-bottom", { placement: "above" });
      const m = geom(g, "t-bottom");
      expect(m.card.b, positioning).toBeLessThanOrEqual(m.target.y + 0.5);
      g.close();
    }
  });
});
