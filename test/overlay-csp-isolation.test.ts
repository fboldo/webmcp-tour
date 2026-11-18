// Ported from spike 005: CSP (real header) and isolation from hostile page CSS.
import { afterEach, describe, expect, it } from "vitest";
import { cardPlaced, cleanup, geom, openFixture, parts, ringOnTarget } from "./helpers.js";

afterEach(cleanup);

describe("CSP: style-src 'self', no 'unsafe-inline' (real header)", () => {
  it("the fixture is served with the header", async () => {
    const res = await fetch("/fx/page.html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("negative control: <style> and style= attributes are blocked", async () => {
    const fx = await openFixture();
    const s = fx.doc.createElement("style");
    s.textContent = "body { outline: 9px solid red }";
    fx.doc.head.append(s);
    const d = fx.doc.createElement("div");
    d.setAttribute("style", "color: rgb(1, 2, 3)");
    fx.doc.body.append(d);
    await new Promise((r) => setTimeout(r, 100));
    expect(fx.win.getComputedStyle(fx.doc.body).outlineWidth).not.toBe("9px");
    expect(fx.win.getComputedStyle(d).color).not.toBe("rgb(1, 2, 3)");
    expect(fx.win.violations.length).toBeGreaterThanOrEqual(2);
  });

  for (const positioning of ["anchor", "fixed"]) {
    it(`overlay styles apply with zero violations (${positioning})`, async () => {
      const fx = await openFixture({ query: `positioning=${positioning}` });
      await fx.show("t-plain");
      fx.win.scrollBy(0, 30); // exercise CSSOM writes in fixed mode
      await fx.frames(3);
      expect(fx.win.violations).toEqual([]);
      expect(fx.win.getComputedStyle(parts(fx).card).paddingTop).toBe("12px"); // adopted sheet applied
    });
  }
});

// "preflight": the fixture's unlayered reset (`*{border-width:0}`, button resets).
// "hostile" adds div:empty{display:none!important}, button{background:hotpink!important;
// padding:20px!important}, [popover]{inset:0;padding:40px;border:dashed}, span{display:block}, *{transition:all 1s}.
for (const kind of ["preflight", "hostile"]) {
  it(`shadow root isolates the overlay from ${kind} page CSS`, async () => {
    const fx = await openFixture({ query: kind === "hostile" ? "hostile=1" : "" });
    await fx.show("t-plain");
    const { card, close, ring, title } = parts(fx);
    const cs = (e: Element) => fx.win.getComputedStyle(e);
    expect(cs(fx.overlay.host!).display).toBe("contents");
    expect(cs(ring).display).toBe("block");
    expect(cs(card).paddingTop).toBe("12px");
    expect(cs(card).borderTopStyle).toBe("solid");
    expect(cs(card).borderTopWidth).toBe("1px");
    expect(cs(close).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(cs(close).paddingTop).toBe("0px");
    expect(cs(title).display).toBe("block"); // grid item → blockified by our rule
    const g = geom(fx, "t-plain");
    expect(ringOnTarget(g)).toBe(true);
    expect(cardPlaced(g).ok).toBe(true);
    expect(g.cardOnTop).toBe(true);
  });
}
