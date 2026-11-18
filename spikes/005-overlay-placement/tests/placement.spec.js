import { test, expect } from "@playwright/test";
import { open, show, geom, frames, expectRingOnTarget, expectCardPlaced } from "./helpers.js";

const shot = (page, name, browserName) =>
  page.screenshot({ path: `test-results/shots/${name}-${browserName}.png` });

for (const positioning of ["anchor", "fixed"]) {
  test.describe(`positioning=${positioning}`, () => {
    test.beforeEach(async ({ page }) => open(page, { positioning }));

    test("mode is what we asked for", async ({ page }) => {
      expect(await page.evaluate(() => spike.overlay.mode)).toBe(positioning);
    });

    for (const id of ["t-plain", "t-header", "t-scroll", "t-contained", "t-bottom"]) {
      test(`ring + card placed on ${id}`, async ({ page, browserName }) => {
        await show(page, id);
        const g = await geom(page, id);
        expectRingOnTarget(g);
        expectCardPlaced(g);
        expect(g.cardOnTop, "card wins the hit test").toBe(true);
        if (id === "t-scroll") await shot(page, `nested-scroll-${positioning}`, browserName);
      });
    }

    test("sequential shows do not inherit the previous flip", async ({ page }) => {
      // Card flips above for a target near the bottom, then must go back
      // below for a target with room below.
      await page.evaluate(() => scrollTo(0, 0));
      await show(page, "t-bottom", { block: "end" });
      const g1 = await geom(page, "t-bottom");
      expect(g1.card.b, "flipped above").toBeLessThanOrEqual(g1.target.y);
      await show(page, "t-plain", { block: "center" });
      const g2 = await geom(page, "t-plain");
      expectRingOnTarget(g2);
      expect(g2.card.y, "back below").toBeGreaterThanOrEqual(g2.target.b);
    });

    test("tracks nested + window scroll and resize", async ({ page }) => {
      await show(page, "t-scroll");
      await page.evaluate(() => {
        document.getElementById("inner").scrollTop -= 25;
        document.getElementById("outer").scrollTop -= 15;
        scrollBy(0, 70);
      });
      await frames(page);
      let g = await geom(page, "t-scroll");
      expectRingOnTarget(g);
      expectCardPlaced(g);
      await page.setViewportSize({ width: 700, height: 600 });
      await frames(page);
      g = await geom(page, "t-scroll");
      expectRingOnTarget(g);
      expectCardPlaced(g);
      // Anchor mode tracks with zero JS; fixed mode needed listener-driven updates.
      const updates = await page.evaluate(() => spike.overlay.stats.updates);
      if (positioning === "anchor") expect(updates).toBe(0);
      else expect(updates).toBeGreaterThan(1);
    });

    test("hides when the target is clipped by its scroll container", async ({ page, browserName }) => {
      test.fail(
        browserName === "firefox" && positioning === "anchor",
        "Firefox 159 parses position-visibility: anchors-visible but does not hide when the anchor is clipped by a scroll container",
      );
      await show(page, "t-scroll");
      await page.evaluate(() => (document.getElementById("inner").scrollTop = 0));
      await frames(page);
      const g = await geom(page, "t-scroll");
      expect(g.cardOnTop, "card must not float over a clipped target").toBe(false);
      await shot(page, `clipped-${positioning}`, browserName);
      // …and comes back when scrolled into view again.
      await page.evaluate(() => document.getElementById("t-scroll").scrollIntoView({ block: "center" }));
      await frames(page);
      expect((await geom(page, "t-scroll")).cardOnTop).toBe(true);
    });

    test("transformed ancestor: ring vs transformed bounding box", async ({ page, browserName }) => {
      test.fail(
        browserName === "firefox" && positioning === "anchor",
        "Firefox anchor() uses the untransformed layout box; Chromium uses the transformed bounding box",
      );
      await show(page, "t-transform");
      const g = await geom(page, "t-transform");
      test.info().annotations.push({ type: "geometry", description: JSON.stringify({ target: g.target, ring: g.ring }) });
      await shot(page, `transform-${positioning}`, browserName);
      expectRingOnTarget(g);
    });

    test("top layer beats a z-index: 2147483647 fixed banner", async ({ page, browserName }) => {
      // Make the max-z-index banner cover the bottom half, put the target
      // just above it: whichever side the card picks, the ring or card meets
      // the banner. Assert the hit test at a card point inside the banner.
      await page.evaluate(() => {
        document.getElementById("banner").style.height = "55vh"; // CSSOM: CSP-safe
        const t = document.getElementById("t-bottom");
        scrollBy(0, t.getBoundingClientRect().bottom - innerHeight * 0.5);
      });
      await show(page, "t-bottom", { block: null, message: "Line one.\nLine two.\nLine three.\nLine four." });
      const g = await geom(page, "t-bottom");
      const bannerTop = await page.evaluate(() => document.getElementById("banner").getBoundingClientRect().top);
      test.info().annotations.push({ type: "geometry", description: JSON.stringify({ g, bannerTop }) });
      expect(g.ring.b, "ring sits on the banner area").toBeGreaterThan(bannerTop);
      const probeY = Math.max(g.card.y, bannerTop) + 4;
      expect(probeY, "card reaches the banner").toBeLessThan(g.card.b);
      const onTop = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        return e === spike.overlay.host || spike.overlay.host.contains(e);
      }, [g.card.x + 20, probeY]);
      expect(onTop, "overlay above the max-z-index banner").toBe(true);
      await shot(page, `zindex-${positioning}`, browserName);
    });
  });
}
