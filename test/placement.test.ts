// Page suggestion placement: center (default), anchor (with fallback), corner.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTour } from "../src/index.js";
import type { Tour, TourOptions } from "../src/index.js";
import { emulateMedia } from "./helpers.js";

const slots = globalThis as Record<symbol, unknown>;
const PAGE = `
  <nav><a id="nav-sec" href="/security" data-tour-page="security">Security</a></nav>
  <button id="under" style="position:fixed;inset:0;opacity:0">under</button>
  <button id="tfa" data-tour-id="two-factor" data-tour-page="security">Set up two-factor</button>
`;
const PAGES = [
  { id: "billing", url: "/billing", title: "Billing" },
  { id: "security", url: "/security", title: "Security" },
];

let tour: Tour;
const fresh = (options: TourOptions = {}) => {
  tour.destroy();
  tour = createTour({ pages: PAGES, navigate: () => {}, resume: false, ...options });
};
const root = () => document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
const q = (p: string) => root().querySelector<HTMLElement>(`[part~=${p}]`)!;
const open = (p: string) => !!q(p)?.matches(":popover-open");
const box = (e: Element) => e.getBoundingClientRect();
const frame = () => new Promise((r) => requestAnimationFrame(r));
const near = (a: number, b: number, d = 2) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);

beforeEach(() => {
  history.replaceState(null, "", "/billing");
  document.body.innerHTML = PAGE;
  tour = createTour({ pages: PAGES, navigate: () => {}, resume: false });
});
afterEach(async () => {
  tour?.destroy();
  document.body.innerHTML = "";
  await emulateMedia({ forcedColors: null, reducedMotion: null });
});

describe("center (default)", () => {
  it("centres the card in the viewport, with no spotlight", async () => {
    expect(await tour.show({ page: "security" })).toMatchObject({ ok: true });
    await frame();
    expect(open("popover")).toBe(true);
    expect(open("spotlight")).toBe(false);
    expect(q("popover").dataset["notice"]).toBe("center");
    const r = box(q("popover"));
    near(r.left + r.width / 2, innerWidth / 2);
    near(r.top + r.height / 2, innerHeight / 2);
  });

  it("is in the top layer over a backdrop that does not block the page", async () => {
    await tour.show({ page: "security" });
    expect(getComputedStyle(q("popover"), "::backdrop").pointerEvents).toBe("none");
    expect(document.elementFromPoint(5, 5)).toBe(document.getElementById("under"));
    let clicks = 0;
    document.getElementById("under")!.addEventListener("click", () => clicks++);
    document.getElementById("under")!.click();
    expect(clicks).toBe(1);
  });

  it("is focusable and announced", async () => {
    await tour.show({ page: "security" });
    expect(q("popover").tabIndex).toBe(-1);
    q("popover").focus();
    expect(root().activeElement).toBe(q("popover"));
    await new Promise((r) => setTimeout(r, 120));
    expect(q("live").textContent).toBe("Your assistant suggests going to Security");
  });

  it("also applies to a target on another page", async () => {
    const r = await tour.show({ target: "two-factor", title: "2FA" });
    expect(r).toMatchObject({ ok: false, error: "other_page" });
    expect(q("popover").dataset["notice"]).toBe("center");
  });

  it("Escape and Not now dismiss it", async () => {
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    await tour.show({ page: "security" });
    dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(open("popover")).toBe(false);
    await tour.show({ page: "security" });
    q("notnow").click();
    expect(open("popover")).toBe(false);
    expect(reasons).toEqual(["declined", "declined"]);
  });

  it("labels still apply", async () => {
    fresh({ labels: { goToPage: "Ir para {page}", otherPage: "Sugestão: {page}", notNow: "Agora não" } });
    await tour.show({ page: "security" });
    expect(q("go").textContent).toBe("Ir para Security");
    expect(q("notnow").textContent).toBe("Agora não");
    expect(q("message").textContent).toBe("Sugestão: Security");
  });

  it("holds under forced colors and reduced motion", async () => {
    await emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await tour.show({ page: "security" });
    await frame();
    const r = box(q("popover"));
    near(r.left + r.width / 2, innerWidth / 2);
    expect(parseFloat(getComputedStyle(q("popover")).borderTopWidth)).toBe(2);
    expect(getComputedStyle(q("popover")).transitionDuration).toBe("0s");
  });
});

describe("corner", () => {
  it("puts the card bottom-right", async () => {
    fresh({ pageSuggestion: { placement: "corner" } });
    await tour.show({ page: "security" });
    await frame();
    expect(q("popover").dataset["notice"]).toBe("corner");
    const r = box(q("popover"));
    near(r.right, innerWidth - 16);
    near(r.bottom, innerHeight - 16);
  });
});

describe("anchor", () => {
  beforeEach(() => fresh({ pageSuggestion: { placement: "anchor" } }));

  it("rings the marked element and attaches the card to it", async () => {
    await tour.show({ page: "security" });
    await frame();
    await frame();
    expect(open("spotlight")).toBe(true);
    expect(q("popover").dataset["notice"]).toBeUndefined();
    const link = box(document.getElementById("nav-sec")!);
    const ring = box(q("spotlight"));
    near(ring.left, link.left);
    near(ring.top, link.top);
    const card = box(q("popover"));
    expect(card.top).toBeGreaterThanOrEqual(link.bottom - 2);
    expect(q("go").hidden).toBe(false);
  });

  it("Go and Not now work as ever; Escape dismisses", async () => {
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    await tour.show({ page: "security" });
    q("notnow").click();
    await tour.show({ page: "security" });
    dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(reasons).toEqual(["declined", "declined"]);
    expect(open("spotlight")).toBe(false);
  });

  it("falls back to center when no marked element is visible", async () => {
    document.getElementById("nav-sec")!.hidden = true;
    await tour.show({ page: "security" });
    expect(open("spotlight")).toBe(false);
    expect(q("popover").dataset["notice"]).toBe("center");
  });

  it("falls back to center when none is marked, and ignores real targets", async () => {
    document.getElementById("nav-sec")!.removeAttribute("data-tour-page");
    await tour.show({ page: "security" }); // the only data-tour-page left is the two-factor target
    expect(open("spotlight")).toBe(false);
    expect(q("popover").dataset["notice"]).toBe("center");
  });

  it("never anchors to an excluded element", async () => {
    document.getElementById("nav-sec")!.setAttribute("data-tour-exclude", "");
    await tour.show({ page: "security" });
    expect(open("spotlight")).toBe(false);
  });
});
