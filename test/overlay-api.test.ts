// Overlay class contract: content safety, hook, headless, lifecycle, events.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, openFixture, parts } from "./helpers.js";

afterEach(cleanup);

describe("content", () => {
  it("renders title and message as text only", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), {
      title: "<img src=x onerror=alert(1)>",
      message: "<b>bold</b> *stars*\nline two",
    });
    const p = parts(fx);
    expect(p.title.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(p.message.textContent).toBe("<b>bold</b> *stars*\nline two");
    expect(p.card.querySelector("img, b")).toBeNull();
  });

  it("carries the attribution label by default and lets it be overridden", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    expect(parts(fx).attribution.textContent).toBe("From the AI assistant");
    fx.overlay.destroy();
    const fx2 = await openFixture({ query: "attribution=Acme%20helper" });
    fx2.overlay.show(fx2.el("t-plain"), { message: "m" });
    expect(parts(fx2).attribution.textContent).toBe("Acme helper");
  });

  it("host carries the root marker and an open shadow root with part names", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    const host = fx.overlay.host!;
    expect(host.hasAttribute("data-webmcp-tour-root")).toBe(true);
    expect(host.shadowRoot?.mode).toBe("open");
    expect(host.shadowRoot!.adoptedStyleSheets.length).toBe(1);
    for (const n of ["spotlight", "popover", "attribution", "title", "message", "close", "goto"])
      expect(host.shadowRoot!.querySelector(`[part~=${n}]`), n).not.toBeNull();
    // Nothing is written onto the author's element.
    expect(fx.el("t-plain").getAttributeNames().sort()).toEqual(["class", "id"]);
  });
});

describe("tokens", () => {
  it("custom properties on the host reach the card", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    fx.overlay.host!.style.setProperty("--tour-surface", "rgb(10, 20, 30)");
    fx.overlay.host!.style.setProperty("--tour-radius", "2px");
    const cs = fx.win.getComputedStyle(parts(fx).card);
    expect(cs.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(cs.borderTopLeftRadius).toBe("2px");
  });

  it("::part() rules from the page win over the defaults", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    const sheet = new fx.win.CSSStyleSheet();
    sheet.replaceSync("[data-webmcp-tour-root]::part(title){color:rgb(1, 2, 3)}");
    fx.doc.adoptedStyleSheets = [sheet];
    expect(fx.win.getComputedStyle(parts(fx).title).color).toBe("rgb(1, 2, 3)");
  });
});

describe("lifecycle and events", () => {
  it("show / dismiss events; a new show supersedes the previous step", async () => {
    const fx = await openFixture();
    const log: string[] = [];
    fx.overlay.on("show", (e) => log.push(`show:${e.target.id}`));
    fx.overlay.on("dismiss", (e) => log.push(`dismiss:${e.target.id}:${e.reason}`));
    fx.overlay.show(fx.el("t-plain"), { message: "a" });
    fx.overlay.show(fx.el("t-header"), { message: "b" });
    expect(fx.overlay.hide()).toBe(true);
    expect(fx.overlay.hide()).toBe(false);
    expect(log).toEqual([
      "show:t-plain",
      "dismiss:t-plain:superseded",
      "show:t-header",
      "dismiss:t-header:hide",
    ]);
  });

  it("goto focuses the target; close dismisses", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    parts(fx).goto.click();
    expect(fx.doc.activeElement).toBe(fx.el("t-plain"));
    parts(fx).close.click();
    expect(fx.overlay.target).toBeUndefined();
  });

  it("destroy removes the host and unhooks listeners", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    fx.overlay.destroy();
    expect(fx.doc.querySelector("[data-webmcp-tour-root]")).toBeNull();
    expect(fx.overlay.host).toBeUndefined();
  });

  it("a throwing event listener does not break the overlay", async () => {
    const fx = await openFixture();
    const errors: unknown[] = [];
    fx.win.addEventListener("error", (e) => (e.preventDefault(), errors.push(e.message)));
    fx.overlay.on("show", () => {
      throw new Error("boom");
    });
    expect(fx.overlay.show(fx.el("t-plain"), { message: "m" }).shown).toBe(true);
    await fx.frames();
    expect(errors.length).toBe(1);
  });
});

describe("render hook and headless mode", () => {
  it("renderPopover may return its own element; positioning and dismissal stay with the library", async () => {
    const fx = await openFixture({ query: "hook=1" });
    const res = fx.overlay.show(fx.el("t-plain"), { title: "T", message: "M" });
    await fx.frames();
    expect(res.shown).toBe(true);
    const card = fx.overlay.host!.shadowRoot!.querySelector<HTMLElement>("#custom")!;
    expect(card.textContent).toContain("T / M");
    expect(card.matches(":popover-open")).toBe(true);
    expect(card.getAttribute("part")).toBe("popover");
    const r = card.getBoundingClientRect();
    const t = fx.el("t-plain").getBoundingClientRect();
    expect(r.top).toBeGreaterThanOrEqual(t.bottom - 1); // placed below the target by the library
    card.querySelector<HTMLElement>("[part~=close]")!.click();
    expect(fx.overlay.target).toBeUndefined();
    expect(fx.overlay.host!.shadowRoot!.querySelector("#custom")).toBeNull();
  });

  it("a hook that throws or returns junk falls back to the default card", async () => {
    const fx = await openFixture({ query: "hook=throw" });
    fx.overlay.show(fx.el("t-plain"), { title: "T", message: "M" });
    expect(parts(fx).title.textContent).toBe("T");
    expect(parts(fx).card.matches(":popover-open")).toBe(true);
  });

  it("render:false is headless: no DOM, events still fire, modal policy still applies", async () => {
    const fx = await openFixture({ query: "headless=1" });
    const log: string[] = [];
    fx.overlay.on("show", (e) => log.push(`show:${e.target.id}`));
    fx.overlay.on("dismiss", (e) => log.push(`dismiss:${e.reason}`));
    const res = fx.overlay.show(fx.el("t-plain"), { message: "m" });
    expect(res).toEqual({ shown: true, positioning: "none" });
    expect(fx.doc.querySelector("[data-webmcp-tour-root]")).toBeNull();
    (fx.el("dlg") as HTMLDialogElement).showModal();
    await fx.frames();
    expect(log).toEqual(["show:t-plain", "dismiss:obscured"]);
  });
});
