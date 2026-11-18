import { test, expect } from "@playwright/test";
import { open, show, geom, expectRingOnTarget } from "./helpers.js";

test("forced-colors: ring becomes a Highlight outline, dimming dropped", async ({ page, browserName }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page);
  await show(page, "t-plain");
  const r = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "Highlight"; // CSSOM write: allowed under CSP
    document.body.append(probe);
    const highlight = getComputedStyle(probe).color;
    const cs = getComputedStyle(spike.overlay.parts.ring);
    return {
      forced: matchMedia("(forced-colors: active)").matches,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      highlight,
      boxShadow: cs.boxShadow,
    };
  });
  test.info().annotations.push({ type: "forced-colors", description: JSON.stringify(r) });
  expect(r.forced).toBe(true);
  expect(r.outlineStyle).toBe("solid");
  expect(r.outlineWidth).toBe("3px");
  expect(r.outlineColor).toBe(r.highlight);
  expect(r.boxShadow).toBe("none");
  await page.screenshot({ path: `test-results/shots/forced-colors-${browserName}.png` });
});

test("prefers-reduced-motion: no transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await show(page, "t-plain");
  const d = await page.evaluate(() =>
    [spike.overlay.parts.ring, spike.overlay.parts.card].map((e) => getComputedStyle(e).transitionDuration),
  );
  expect(d).toEqual(["0s", "0s"]);
});

// 400% zoom of a 1280×1024 window = a 320×256 CSS-px viewport (WCAG 1.4.10
// reflow), rendered at device scale factor 4.
test.describe("400% zoom (320×256 CSS px @4x)", () => {
  test.use({ viewport: { width: 320, height: 256 }, deviceScaleFactor: 4 });
  for (const positioning of ["anchor", "fixed"])
    for (const id of ["t-plain", "t-header", "t-bottom"])
      test(`${positioning}: card fits beside ${id} without covering it (content may scroll)`, async ({ page, browserName }) => {
        await open(page, { positioning });
        await show(page, id, {
          message: "Open the plan picker, choose a plan, then confirm. Your card is charged on the next cycle.",
        });
        const g = await geom(page, id);
        const r = await page.evaluate(() => {
          const c = spike.overlay.parts.card;
          return {
            cardScrolls: c.scrollHeight > c.clientHeight,
            scrollW: c.scrollWidth,
            clientW: c.clientWidth,
            docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });
        test.info().annotations.push({ type: "geometry", description: JSON.stringify({ g, r }) });
        expectRingOnTarget(g);
        expect(g.card.x).toBeGreaterThanOrEqual(0);
        expect(g.card.r).toBeLessThanOrEqual(g.vw);
        expect(g.card.y).toBeGreaterThanOrEqual(0);
        expect(g.card.b).toBeLessThanOrEqual(g.vh);
        expect(r.scrollW, "no horizontal clipping of text").toBeLessThanOrEqual(r.clientW);
        const t = g.target, c = g.card;
        expect(c.x < t.r && c.r > t.x && c.y < t.b && c.b > t.y, "card must not cover the target").toBe(false);
        expect(g.cardOnTop).toBe(true);
        if (id === "t-plain") await page.screenshot({ path: `test-results/shots/zoom400-${positioning}-${browserName}.png` });
      });
});
