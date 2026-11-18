import { test, expect } from "@playwright/test";
import { open, show, geom } from "./helpers.js";

test.describe("CSP: style-src 'self', no 'unsafe-inline' (real header)", () => {
  test("the header is really there", async ({ page }) => {
    const res = await page.goto("/fixtures/hostile.html");
    expect(res.headers()["content-security-policy"]).toContain("style-src 'self'");
    expect(res.headers()["content-security-policy"]).not.toContain("unsafe-inline");
  });

  test("negative control: <style> and style= attributes are blocked", async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const s = document.createElement("style");
      s.textContent = "body { outline: 9px solid red }";
      document.head.append(s);
      const d = document.createElement("div");
      d.setAttribute("style", "color: rgb(1, 2, 3)");
      document.body.append(d);
      await new Promise((r) => setTimeout(r, 50));
      return {
        styleApplied: getComputedStyle(document.body).outlineWidth === "9px",
        attrApplied: getComputedStyle(d).color === "rgb(1, 2, 3)",
        violations: window.__violations.map((v) => v.directive),
      };
    });
    expect(r.styleApplied).toBe(false);
    expect(r.attrApplied).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(2);
  });

  for (const positioning of ["anchor", "fixed"])
    for (const isolation of ["shadow", "layer"])
      test(`overlay styles apply with zero violations (${positioning}/${isolation})`, async ({ page }) => {
        await open(page, { positioning, isolation });
        await show(page, "t-plain");
        await page.evaluate(() => scrollBy(0, 30)); // exercise CSSOM writes in fixed mode
        await page.waitForTimeout(50);
        const r = await page.evaluate(() => ({
          violations: window.__violations,
          cardPaddingTop: getComputedStyle(spike.overlay.parts.card).paddingTop,
        }));
        expect(r.violations).toEqual([]);
        expect(r.cardPaddingTop).toBe("12px"); // adoptedStyleSheets applied
      });
});

// What page CSS does to the overlay. "preflight" = Tailwind v3 preflight
// (unlayered); "hostile" adds div:empty{display:none!important},
// button{background:hotpink!important;padding:20px!important},
// [popover]{inset:0;padding:40px;border:dashed}, span{display:block}, *{transition:all 1s}.
const styleProbe = () => {
  const { card, close, title, ring } = spike.overlay.parts;
  const cs = (e) => getComputedStyle(e);
  return {
    hostDisplay: cs(spike.overlay.host).display,
    ringDisplay: cs(ring).display,
    cardOpen: card.matches(":popover-open"),
    cardPadding: cs(card).paddingTop,
    cardBorderStyle: cs(card).borderTopStyle,
    cardBorderWidth: cs(card).borderTopWidth,
    closeBg: cs(close).backgroundColor,
    closePadding: cs(close).paddingTop,
    titleDisplay: cs(title).display,
    ringTransition: cs(ring).transitionProperty + " " + cs(ring).transitionDuration,
  };
};

for (const page_ of ["preflight", "hostile"]) {
  test(`isolation=shadow survives ${page_} page CSS`, async ({ page, browserName }) => {
    await open(page, { isolation: "shadow", ...(page_ === "hostile" ? { hostile: 1 } : {}) });
    await page.waitForTimeout(100);
    await show(page, "t-plain");
    const s = await page.evaluate(styleProbe);
    test.info().annotations.push({ type: "styles", description: JSON.stringify(s) });
    expect(s.hostDisplay).toBe("contents");
    expect(s.ringDisplay).toBe("block");
    expect(s.cardPadding).toBe("12px");
    expect(s.cardBorderStyle).toBe("solid");
    expect(s.closeBg).toBe("rgba(0, 0, 0, 0)");
    expect(s.closePadding).toBe("0px");
    expect(s.titleDisplay).toBe("block"); // grid item → blockified, our rule
    expectGeom(await geom(page, "t-plain"));
    if (page_ === "hostile") await page.screenshot({ path: `test-results/shots/isolation-shadow-hostile-${browserName}.png` });
  });

  test(`isolation=layer (plan as written) vs ${page_} page CSS`, async ({ page, browserName }) => {
    await open(page, { isolation: "layer", ...(page_ === "hostile" ? { hostile: 1 } : {}) });
    await page.waitForTimeout(100);
    await show(page, "t-plain");
    const s = await page.evaluate(styleProbe);
    test.info().annotations.push({ type: "styles", description: JSON.stringify(s) });
    if (page_ === "hostile") await page.screenshot({ path: `test-results/shots/isolation-layer-hostile-${browserName}.png` });
    // Unlayered page rules beat anything inside @layer webmcp-tour.
    if (page_ === "preflight") {
      expect(s.cardBorderWidth, "preflight's border-width:0 wins over our layered border").toBe("0px");
      expect(s.closePadding, "preflight's button padding:0 wins").toBe("0px");
    } else {
      expect(s.ringDisplay, "div:empty{display:none!important} removes the spotlight").toBe("none");
      expect(s.closeBg, "button{background:hotpink!important} wins").toBe("rgb(255, 105, 180)");
      expect(s.cardPadding, "[popover]{padding:40px} wins").toBe("40px");
    }
  });
}

function expectGeom(g) {
  expect(Math.abs(g.ring.x - g.target.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.ring.w - g.target.w)).toBeLessThanOrEqual(1);
  expect(g.cardOnTop).toBe(true);
}
