// Accessibility behaviour of the overlay: live region, take-me-there, describedby, Escape, compact layout.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, emulateMedia, openFixture, parts } from "./helpers.js";

afterEach(cleanup);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (fx: Awaited<ReturnType<typeof openFixture>>, init: KeyboardEventInit, on: EventTarget) =>
  on.dispatchEvent(new fx.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true, ...init }));

describe("live region", () => {
  it("is mounted before any step, visually hidden, and separate from the card", async () => {
    const fx = await openFixture();
    fx.overlay.mount();
    const live = fx.overlay.host!.shadowRoot!.querySelector<HTMLElement>("[part~=live]")!;
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    const r = live.getBoundingClientRect();
    expect(r.width).toBeLessThanOrEqual(1);
    expect(r.height).toBeLessThanOrEqual(1);
    fx.overlay.show(fx.el("t-plain"), { message: "Pick a plan." });
    expect(parts(fx).card.contains(live)).toBe(false);
  });

  it("announces the message once the step is up, and clears on dismiss", async () => {
    const fx = await openFixture();
    fx.overlay.mount();
    const live = fx.overlay.host!.shadowRoot!.querySelector<HTMLElement>("[part~=live]")!;
    fx.overlay.show(fx.el("t-plain"), { message: "Pick a plan.", announcement: "Pick a plan. — Change plan, main" });
    await wait(150);
    expect(live.textContent).toBe("Pick a plan. — Change plan, main");
    fx.overlay.hide();
    expect(live.textContent).toBe("");
  });

  it("survives a step moving into a dialog (same node, same element)", async () => {
    const fx = await openFixture();
    fx.overlay.mount();
    const live = fx.overlay.host!.shadowRoot!.querySelector("[part~=live]");
    (fx.el("dlg") as HTMLDialogElement).showModal();
    fx.overlay.show(fx.el("t-dialog"), { message: "Confirm." });
    await wait(150);
    expect(fx.overlay.host!.shadowRoot!.querySelector("[part~=live]")).toBe(live);
    expect(live!.textContent).toBe("Confirm.");
  });
});

describe("take me there", () => {
  it("focuses the target only when pressed, never on show", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    expect(fx.doc.activeElement).not.toBe(fx.el("t-plain"));
    parts(fx).goto.click();
    expect(fx.doc.activeElement).toBe(fx.el("t-plain"));
  });

  it("makes a non-focusable target focusable for the moment, then puts it back", async () => {
    const fx = await openFixture();
    const div = fx.doc.createElement("div");
    div.id = "plain-div";
    div.textContent = "Not a control";
    fx.doc.body.prepend(div);
    fx.overlay.show(div, { message: "m" });
    parts(fx).goto.click();
    expect(fx.doc.activeElement).toBe(div);
    expect(div.getAttribute("tabindex")).toBe("-1");
    fx.el("t-plain").focus();
    expect(div.hasAttribute("tabindex")).toBe(false);
  });
});

describe("take me there: visibility", () => {
  it("scrolls an off-screen target to the centre, without moving it when already in view", async () => {
    const fx = await openFixture();
    const t = fx.el("t-bottom");
    fx.win.scrollTo(0, 0);
    fx.overlay.show(t, { message: "m" });
    expect(t.getBoundingClientRect().top).toBeGreaterThan(fx.win.innerHeight);
    parts(fx).goto.click();
    await fx.frames();
    const r = t.getBoundingClientRect();
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(fx.win.innerHeight);
    const y = fx.win.scrollY;
    parts(fx).goto.click();
    expect(fx.win.scrollY).toBe(y);
  });

  it("focuses so the ring shows (focus-visible) after a mouse click", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    parts(fx).goto.click();
    expect(fx.el("t-plain").matches(":focus-visible")).toBe(true);
  });

  it("pulses the spotlight", async () => {
    const fx = await openFixture();
    await fx.show("t-plain");
    parts(fx).goto.click();
    expect(parts(fx).ring.getAnimations().length).toBe(1);
  });

  it("does not pulse under prefers-reduced-motion", async () => {
    await emulateMedia({ reducedMotion: "reduce" });
    const fx = await openFixture();
    await fx.show("t-plain");
    parts(fx).goto.click();
    expect(parts(fx).ring.getAnimations().length).toBe(0);
  });
});

describe("describeTarget", () => {
  it("is off by default: the target is untouched", async () => {
    const fx = await openFixture();
    const before = fx.el("t-plain").getAttributeNames();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    expect(fx.el("t-plain").getAttributeNames()).toEqual(before);
  });

  it("points at a light-DOM copy of the message and restores the attribute", async () => {
    const fx = await openFixture({ query: "describe" });
    const t = fx.el("t-plain");
    t.setAttribute("aria-describedby", "keep");
    fx.overlay.show(t, { message: "Pick a plan." });
    const ids = t.getAttribute("aria-describedby")!.split(" ");
    expect(ids[0]).toBe("keep");
    const node = fx.doc.getElementById(ids[1]!)!;
    expect(node.textContent).toBe("Pick a plan.");
    fx.overlay.show(fx.el("t-header"), { message: "Other." });
    expect(t.getAttribute("aria-describedby")).toBe("keep");
    expect(fx.doc.getElementById(ids[1]!)).toBeNull();
    fx.overlay.hide();
    expect(fx.el("t-header").hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps the page's later edits to the attribute", async () => {
    const fx = await openFixture({ query: "describe" });
    const t = fx.el("t-plain");
    fx.overlay.show(t, { message: "m" });
    t.setAttribute("aria-describedby", `${t.getAttribute("aria-describedby")} page-added`);
    fx.overlay.hide();
    expect(t.getAttribute("aria-describedby")).toBe("page-added");
  });
});

describe("Escape", () => {
  it("dismisses when the key was not claimed", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    key(fx, {}, fx.el("t-plain"));
    expect(fx.overlay.target).toBeUndefined();
  });

  it("does not fight the app: a handler that prevented default keeps the step", async () => {
    const fx = await openFixture();
    fx.el("t-plain").addEventListener("keydown", (e) => e.preventDefault());
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    key(fx, {}, fx.el("t-plain"));
    expect(fx.overlay.target).toBe(fx.el("t-plain"));
  });

  it("dismisses from inside the card even when something prevented default", async () => {
    const fx = await openFixture();
    fx.doc.addEventListener("keydown", (e) => e.preventDefault(), true);
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    key(fx, {}, parts(fx).goto);
    expect(fx.overlay.target).toBeUndefined();
  });

  it("is not for a field: Escape typed in a page input leaves the step, but the card's own Escape closes it", async () => {
    const fx = await openFixture();
    const field = fx.doc.createElement("input");
    fx.doc.body.append(field);
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    key(fx, {}, field);
    expect(fx.overlay.target).toBe(fx.el("t-plain"));
    key(fx, {}, fx.el("t-plain"));
    expect(fx.overlay.target).toBeUndefined();
  });

  it("ignores other keys and IME composition, and stops listening afterwards", async () => {
    const fx = await openFixture();
    fx.overlay.show(fx.el("t-plain"), { message: "m" });
    key(fx, { key: "Enter" }, fx.el("t-plain"));
    key(fx, { isComposing: true }, fx.el("t-plain"));
    expect(fx.overlay.target).toBe(fx.el("t-plain"));
    fx.overlay.hide();
    fx.overlay.show(fx.el("t-header"), { message: "m" });
    key(fx, {}, fx.el("t-header"));
    expect(fx.overlay.target).toBeUndefined();
  });
});

// 400% zoom of a 1280×1024 window = 320×256 CSS px (WCAG 1.4.10 reflow); emulated by sizing the iframe.
describe("compact layout (320×256)", () => {
  for (const positioning of ["anchor", "fixed"])
    for (const id of ["t-plain", "t-header", "t-bottom"])
      it(`${positioning}: Take me there and Dismiss stay visible beside ${id} without scrolling`, async () => {
        const fx = await openFixture({ query: `positioning=${positioning}`, width: 320, height: 256 });
        await fx.show(id, { message: "Open the plan picker, choose a plan, then confirm. Your card is charged on the next cycle. ".repeat(3) });
        const { card, goto, close, message } = parts(fx);
        expect(card.scrollTop).toBe(0);
        const c = card.getBoundingClientRect();
        for (const b of [goto, close]) {
          const r = b.getBoundingClientRect();
          expect(r.height, "button rendered").toBeGreaterThan(0);
          expect(r.top).toBeGreaterThanOrEqual(c.top);
          expect(r.bottom).toBeLessThanOrEqual(c.bottom);
          expect(r.bottom).toBeLessThanOrEqual(fx.doc.documentElement.clientHeight);
        }
        expect(goto.getBoundingClientRect().bottom).toBeLessThanOrEqual(message.getBoundingClientRect().top + 1);
      });
});
