import { test, expect } from "@playwright/test";
import { open, show, geom, frames, expectRingOnTarget, expectCardPlaced } from "./helpers.js";

for (const positioning of ["anchor", "fixed"]) {
  test.describe(`positioning=${positioning}`, () => {
    test.beforeEach(async ({ page }) => {
      await open(page, { positioning });
      await page.evaluate(() => document.getElementById("dlg").showModal());
    });

    async function clickClose(page) {
      const box = await page.evaluate(() => {
        const r = spike.overlay.parts.close.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(box.x, box.y);
      return page.evaluate(() => spike.overlay.stats.closeClicks);
    }

    test("target in an open modal dialog: mounted inside it, on top, clickable", async ({ page, browserName }) => {
      const info = await show(page, "t-dialog", { block: null });
      expect(info.mountedIn).toBe("dialog");
      const g = await geom(page, "t-dialog");
      expectRingOnTarget(g);
      expectCardPlaced(g);
      expect(g.cardOnTop).toBe(true);
      await page.screenshot({ path: `test-results/shots/dialog-${positioning}-${browserName}.png` });
      expect(await clickClose(page), "close button receives the click").toBe(1);
    });

    test("control: mounted on <body> while a modal is open → visible but inert", async ({ page }) => {
      const info = await show(page, "t-dialog", { block: null, mount: "body" });
      expect(info.mountedIn).toBe("body");
      const g = await geom(page, "t-dialog");
      expectRingOnTarget(g); // it still *draws* in the top layer…
      expect(g.cardOnTop, "…but inert content is skipped by hit testing").toBe(false);
      expect(await clickClose(page), "close button is dead").toBe(0);
    });
  });
}

test("a modal opened *after* the step covers the overlay until raise()", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.getElementById("dlg").close());
  await show(page, "t-plain");
  expect((await geom(page, "t-plain")).cardOnTop).toBe(true);
  // Dialog opens later: it enters the top layer above our popovers.
  await page.evaluate(() => document.getElementById("dlg").showModal());
  await frames(page);
  const covered = await page.evaluate(() => {
    const c = spike.overlay.parts.card.getBoundingClientRect();
    const hit = document.elementFromPoint(c.left + 5, c.top + 5);
    return { hitInsideOverlay: spike.overlay.host.contains(hit) || hit === spike.overlay.host };
  });
  expect(covered.hitInsideOverlay).toBe(false);
  // Re-showing moves us to the top of the top layer — but the target is now
  // inert (outside the dialog), so the right product answer is to dismiss.
  await page.evaluate(() => spike.overlay.raise());
  await frames(page);
  const g = await geom(page, "t-plain");
  expect(g.cardOnTop, "raised, but still outside the modal → inert").toBe(false);
});
