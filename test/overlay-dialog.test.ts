// Mounting inside an open modal dialog, and the obscured-modal policy.
import { afterEach, describe, expect, it } from "vitest";
import { cardPlaced, cleanup, geom, openFixture, parts, ringOnTarget } from "./helpers.js";

afterEach(cleanup);

for (const positioning of ["anchor", "fixed"]) {
  describe(`positioning=${positioning}`, () => {
    it("target in an open modal dialog: mounted inside it, on top, close is hit-testable and works", async () => {
      const fx = await openFixture({ query: `positioning=${positioning}` });
      (fx.el("dlg") as HTMLDialogElement).showModal();
      const res = await fx.show("t-dialog", { block: null });
      expect(res.shown).toBe(true);
      expect(fx.overlay.host!.parentElement).toBe(fx.el("dlg"));
      const g = geom(fx, "t-dialog");
      expect(ringOnTarget(g)).toBe(true);
      expect(cardPlaced(g).ok).toBe(true);
      expect(g.cardOnTop).toBe(true);
      const c = parts(fx).close.getBoundingClientRect();
      expect(fx.doc.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)).toBe(fx.overlay.host);
      parts(fx).close.click();
      expect(fx.overlay.target).toBeUndefined();
      expect(parts(fx).card.matches(":popover-open")).toBe(false);
    });
  });
}

describe("obscured modal", () => {
  it("a modal already open with the target outside it: not shown, reason obscured", async () => {
    const fx = await openFixture();
    (fx.el("dlg") as HTMLDialogElement).showModal();
    const res = fx.overlay.show(fx.el("t-plain"), { message: "x" });
    expect(res).toEqual({ shown: false, positioning: "none", reason: "obscured" });
    expect(fx.overlay.target).toBeUndefined();
  });

  it("a modal opened after the step dismisses it with reason obscured (never re-raised)", async () => {
    const fx = await openFixture();
    const events: unknown[] = [];
    fx.overlay.on("dismiss", (e) => events.push(e.reason));
    await fx.show("t-plain");
    expect(geom(fx, "t-plain").cardOpen).toBe(true);
    (fx.el("dlg") as HTMLDialogElement).showModal();
    await fx.frames();
    expect(events).toEqual(["obscured"]);
    expect(fx.overlay.target).toBeUndefined();
    expect(parts(fx).card.matches(":popover-open")).toBe(false);
  });

  it("closing the dialog the overlay is mounted in dismisses the step", async () => {
    const fx = await openFixture();
    const events: unknown[] = [];
    fx.overlay.on("dismiss", (e) => events.push(e.reason));
    (fx.el("dlg") as HTMLDialogElement).showModal();
    await fx.show("t-dialog", { block: null });
    (fx.el("dlg") as HTMLDialogElement).close();
    await fx.frames();
    expect(events).toEqual(["obscured"]);
  });

  it("a non-modal state change does not dismiss", async () => {
    const fx = await openFixture();
    await fx.show("t-plain");
    (fx.el("dlg") as HTMLDialogElement).show(); // non-modal open
    await fx.frames();
    expect(fx.overlay.target).toBe(fx.el("t-plain"));
  });
});
