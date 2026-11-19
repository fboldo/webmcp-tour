// createTour contract: instances, envelopes, replace semantics, caps, targets, constraints.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/index.js";
import type { Tour } from "../src/index.js";

let tour: Tour;

function page(html: string): void {
  document.body.innerHTML = html;
}
const card = (): HTMLElement | null => document.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector("[part~=popover]") ?? null;
const part = (name: string): string => card()?.querySelector(`[part~=${name}]`)?.textContent ?? "";

const PAGE = `
  <h2>Account</h2>
  <button id="plan" data-tour-id="billing-plan" data-tour-description="Opens the plan picker.">Change plan</button>
  <button id="save">Save changes</button>
  <input id="mail" type="email" aria-label="Email address">
  <table><tr><td>A</td><td><button id="r1">Revoke</button></td></tr><tr><td>B</td><td><button id="r2">Revoke</button></td></tr></table>
  <details><summary>More</summary><button id="hidden2fa" data-tour-id="two-factor" data-tour-reveal="Open More first.">Set up 2FA</button></details>
`;

beforeEach(() => {
  page(PAGE);
  tour = createTour();
});
afterEach(() => {
  tour?.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("instances", () => {
  it("returns a new tour on every call, each with its own options", () => {
    const other = createTour({ attribution: "Other" });
    expect(other).not.toBe(tour);
    expect(createTour()).not.toBe(createTour());
    other.destroy();
  });

  it("destroy dismisses and removes only its own host", async () => {
    const other = createTour();
    await tour.show({ text: "Save changes", message: "m" });
    expect(document.querySelectorAll("[data-webmcp-tour-root]")).toHaveLength(2);
    tour.destroy();
    expect(document.querySelectorAll("[data-webmcp-tour-root]")).toHaveLength(1);
    other.destroy();
    expect(document.querySelector("[data-webmcp-tour-root]")).toBeNull();
  });

  it("tours share the screen: a step in one supersedes the other's, and its pending wait", async () => {
    const other = createTour();
    const ev: string[] = [];
    tour.on("dismiss", (e) => ev.push(`a:${e.reason}`));
    other.on("show", () => ev.push("b:show"));
    await tour.show({ text: "Save changes", message: "m" });
    const waiting = tour.waitForInteraction();
    await other.show({ text: "Change plan", message: "n" });
    expect(await waiting).toMatchObject({ ok: true, status: "superseded" });
    expect(ev.sort()).toEqual(["a:hide", "b:show"]);
    expect(document.querySelectorAll("[part~=popover]:popover-open")).toHaveLength(0); // shadow roots are not searched
    other.destroy();
  });

  it("is quiet at import: creating a tour mounts only the empty live region, nothing is drawn", () => {
    const host = document.querySelector("[data-webmcp-tour-root]")!;
    expect(host.shadowRoot!.querySelector("[part~=popover],[part~=spotlight]")).toBeNull();
    expect(host.shadowRoot!.querySelector("[part~=live]")!.textContent).toBe("");
  });

  it("headless mounts nothing at all", () => {
    tour.destroy();
    createTour({ render: false });
    expect(document.querySelector("[data-webmcp-tour-root]")).toBeNull();
  });
});

describe("show: success envelope", () => {
  it("points at an element by text", async () => {
    const r = await tour.show({ text: "Save changes", title: "Save", message: "Click to save." });
    expect(r).toEqual({
      ok: true,
      matched: { by: "text", tag: "button", role: "button", name: "save changes", text: "save changes", disabled: false, inViewport: true, scrolledIntoView: false, occluded: false },
    });
    expect(part("title")).toBe("Save");
    expect(part("message")).toBe("Click to save.");
    expect(card()!.matches(":popover-open")).toBe(true);
  });

  it("points at an element by selector", async () => {
    const r = await tour.show({ selector: "#mail", message: "Enter it here." });
    expect(r).toMatchObject({ ok: true, matched: { by: "selector", tag: "input", name: "email address" } });
  });

  it("points at a declared target and uses its description as the message", async () => {
    const r = await tour.show({ target: "billing-plan" });
    expect(r).toMatchObject({ ok: true, matched: { by: "target", name: "change plan" } });
    expect(part("message")).toBe("Opens the plan picker.");
  });

  it("an explicit message beats the description", async () => {
    await tour.show({ target: "billing-plan", message: "Mine." });
    expect(part("message")).toBe("Mine.");
  });

  it("works with zero declared targets", async () => {
    page('<button>Export data</button>');
    expect(await tour.show({ text: "Export data", message: "Here." })).toMatchObject({ ok: true });
  });

  it("reports the scroll when the target was off screen", async () => {
    page('<div style="height:3000px"></div><button id="far">Far away</button>');
    const r = await tour.show({ selector: "#far", message: "m" });
    expect(r).toMatchObject({ ok: true, matched: { inViewport: false, scrolledIntoView: true } });
  });

  it("reports a disabled control", async () => {
    page("<button disabled>Upgrade</button>");
    expect(await tour.show({ text: "Upgrade", message: "m" })).toMatchObject({ ok: true, matched: { disabled: true } });
  });

  it("renders title and message as plain text", async () => {
    await tour.show({ text: "Save changes", title: "<b>t</b>", message: "*not bold*\n<img src=x onerror=alert(1)>" });
    expect(part("title")).toBe("<b>t</b>");
    expect(part("message")).toBe("*not bold*\n<img src=x onerror=alert(1)>");
    expect(card()!.querySelector("b, img")).toBeNull();
  });

  it("writes nothing onto the author's element", async () => {
    const before = document.getElementById("save")!.getAttributeNames();
    await tour.show({ text: "Save changes", message: "m" });
    expect(document.getElementById("save")!.getAttributeNames()).toEqual(before);
  });
});

describe("show: failure envelopes", () => {
  it("target_not_found lists the available ids", async () => {
    expect(await tour.show({ target: "nope", message: "m" })).toEqual({ ok: false, error: "target_not_found", available: ["billing-plan", "two-factor"] });
  });

  it("not_found carries visible interactive names as `near`", async () => {
    const r = await tour.show({ text: "Change password", message: "m" });
    expect(r).toMatchObject({ ok: false, error: "not_found" });
    expect((r as { near: string[] }).near).toContain("change plan");
  });

  it("ambiguous lists candidates; index settles it", async () => {
    const r = await tour.show({ text: "Revoke", message: "m" });
    expect(r).toMatchObject({ ok: false, error: "ambiguous", count: 2 });
    expect((r as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(await tour.show({ text: "Revoke", index: 1, message: "m" })).toMatchObject({ ok: true });
  });

  it("not_visible returns the author's reveal hint for declared targets", async () => {
    expect(await tour.show({ target: "two-factor", message: "m" })).toEqual({ ok: false, error: "not_visible", reveal: "Open More first." });
  });

  it("invalid_selector", async () => {
    expect(await tour.show({ selector: "a[", message: "m" })).toEqual({ ok: false, error: "invalid_selector" });
  });

  it("obscured: a modal dialog elsewhere makes the page inert", async () => {
    page('<button id="b">Behind</button><dialog id="d"><button>In dialog</button></dialog>');
    (document.getElementById("d") as HTMLDialogElement).showModal();
    expect(await tour.show({ selector: "#b", message: "m" })).toMatchObject({ ok: false, error: "obscured" });
    expect(card()?.matches(":popover-open") ?? false).toBe(false);
    // Inside the dialog it works.
    expect(await tour.show({ text: "In dialog", message: "m" })).toMatchObject({ ok: true });
  });

  it("a failed show leaves the current step in place", async () => {
    await tour.show({ text: "Save changes", message: "first" });
    await tour.show({ text: "Nothing like this", message: "m" });
    expect(part("message")).toBe("first");
  });
});

describe("show: input validation", () => {
  const bad = async (step: unknown, match: RegExp) => {
    const r = await tour.show(step as never);
    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    expect((r as { message: string }).message).toMatch(match);
  };

  it("needs exactly one locator", async () => {
    await bad({ message: "m" }, /exactly one/);
    await bad({ text: "Save changes", selector: "#save", message: "m" }, /exactly one/);
  });

  it("needs a message unless the target has a description", async () => {
    await bad({ selector: "#plan" }, /message is required/);
    await bad({ text: "Save changes" }, /message is required/);
    await bad({ text: "Save changes", message: "   " }, /message is required/);
  });

  it("caps title at 80 and message at 500", async () => {
    await bad({ text: "Save changes", title: "t".repeat(81), message: "m" }, /title is over 80/);
    await bad({ text: "Save changes", message: "m".repeat(501) }, /message is over 500/);
    expect(await tour.show({ text: "Save changes", title: "t".repeat(80), message: "m".repeat(500) })).toMatchObject({ ok: true });
  });

  it("rejects wrong types and placements, never throws", async () => {
    await bad({ text: "Save changes", message: 5 }, /message must be a string/);
    await bad({ text: "Save changes", title: {}, message: "m" }, /title must be a string/);
    await bad({ text: "Save changes", message: "m", placement: "left" }, /placement/);
    await bad({ text: 5, message: "m" }, /text must be/);
    await bad(null, /object/);
    await bad({ text: "Save changes", index: -1, message: "m" }, /index/);
  });
});

describe("replace and dismiss", () => {
  it("a new show replaces the current step", async () => {
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    await tour.show({ text: "Save changes", message: "one" });
    await tour.show({ text: "Change plan", message: "two" });
    expect(reasons).toEqual(["superseded"]);
    expect(part("message")).toBe("two");
    expect(document.querySelectorAll("[data-webmcp-tour-root]")).toHaveLength(1);
    expect(card()!.parentNode!.querySelectorAll(":popover-open")).toHaveLength(2); // ring + card, once
  });

  it("dismiss removes the step, emits, and is idempotent", async () => {
    const events: string[] = [];
    tour.on("dismiss", (e) => events.push(e.reason));
    await tour.show({ text: "Save changes", message: "m" });
    expect(tour.dismiss()).toEqual({ ok: true, dismissed: true });
    expect(card()!.matches(":popover-open")).toBe(false);
    expect(tour.dismiss()).toEqual({ ok: true, dismissed: true });
    expect(events).toEqual(["hide"]);
  });

  it("show and dismiss events carry the element and step", async () => {
    const shown: unknown[] = [];
    const off = tour.on("show", (e) => shown.push(e));
    await tour.show({ text: "Save changes", title: "T", message: "M", placement: "above" });
    expect(shown).toEqual([{ target: document.getElementById("save"), title: "T", message: "M", placement: "above" }]);
    off();
    await tour.show({ text: "Change plan", message: "M" });
    expect(shown).toHaveLength(1);
  });
});

describe("defineTarget", () => {
  it("by element, with description and reveal", async () => {
    tour.defineTarget({ id: "mail-field", element: document.getElementById("mail")!, description: "Where we send receipts." });
    expect(await tour.show({ target: "mail-field" })).toMatchObject({ ok: true, matched: { by: "target", tag: "input" } });
    expect(part("message")).toBe("Where we send receipts.");
  });

  it("by selector, resolved at call time", async () => {
    tour.defineTarget({ id: "later", selector: "#late", description: "Appears later." });
    expect(await tour.show({ target: "later" })).toMatchObject({ ok: false, error: "target_not_found" });
    document.body.insertAdjacentHTML("beforeend", '<button id="late">Late</button>');
    expect(await tour.show({ target: "later" })).toMatchObject({ ok: true });
  });

  it("not_visible uses the defined reveal hint", async () => {
    document.body.insertAdjacentHTML("beforeend", '<button id="h" hidden>Hidden</button>');
    tour.defineTarget({ id: "h", selector: "#h", reveal: "Click Show first." });
    expect(await tour.show({ target: "h", message: "m" })).toEqual({ ok: false, error: "not_visible", reveal: "Click Show first." });
  });

  it("wins over a data-tour-id of the same id, and the returned function removes it", async () => {
    const remove = tour.defineTarget({ id: "billing-plan", selector: "#save", description: "Overridden." });
    expect(await tour.show({ target: "billing-plan" })).toMatchObject({ ok: true, matched: { name: "save changes" } });
    remove();
    expect(await tour.show({ target: "billing-plan" })).toMatchObject({ ok: true, matched: { name: "change plan" } });
  });

  it("is listed in target_not_found", async () => {
    tour.defineTarget({ id: "extra", selector: "#save" });
    const r = await tour.show({ target: "nope", message: "m" });
    expect((r as { available: string[] }).available).toContain("extra");
  });

  it("throws on programmer errors", () => {
    expect(() => tour.defineTarget({ id: "", selector: "#x" })).toThrow(TypeError);
    expect(() => tour.defineTarget({ id: "a" })).toThrow(TypeError);
    expect(() => tour.defineTarget({ id: "a", selector: "#x", element: document.body })).toThrow(TypeError);
    expect(() => tour.defineTarget({ id: "a", selector: "a[" })).toThrow();
  });
});

describe("options", () => {
  const fresh = (o: Parameters<typeof createTour>[0]) => {
    tour.destroy();
    return (tour = createTour(o));
  };

  it("exclude and data-tour-exclude keep controls off-limits", async () => {
    page('<button id="a">Delete</button><button id="b" data-tour-exclude>Wipe</button><div id="x"><button>Inside</button></div>');
    fresh({ exclude: "#a, #x" });
    for (const text of ["Delete", "Wipe", "Inside"]) expect(await tour.show({ text, message: "m" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await tour.show({ selector: "#b", message: "m" })).toMatchObject({ ok: false, error: "not_found" });
  });

  it("scope limits the primitive to a subtree", async () => {
    page('<button>Outside</button><div id="s"><button>Inside</button></div>');
    fresh({ scope: document.getElementById("s")! });
    expect(await tour.show({ text: "Inside", message: "m" })).toMatchObject({ ok: true });
    expect(await tour.show({ text: "Outside", message: "m" })).toMatchObject({ ok: false, error: "not_found" });
  });

  it("locators can turn selector and text off; target stays", async () => {
    fresh({ locators: { selector: false, text: false } });
    expect(await tour.show({ selector: "#save", message: "m" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await tour.show({ text: "Save changes", message: "m" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await tour.show({ target: "billing-plan" })).toMatchObject({ ok: true });
  });

  it("an invalid exclude selector throws at creation", () => {
    tour.destroy();
    expect(() => createTour({ exclude: "a[" })).toThrow(TypeError);
  });

  it("attribution is overridable", async () => {
    fresh({ attribution: "Acme helper" });
    await tour.show({ text: "Save changes", message: "m" });
    expect(part("attribution")).toBe("Acme helper");
  });

  it("renderPopover replaces the markup", async () => {
    fresh({
      renderPopover: (step) => {
        const el = document.createElement("section");
        el.id = "mine";
        el.textContent = `${step.title}|${step.message}`;
        return el;
      },
    });
    await tour.show({ text: "Save changes", title: "T", message: "M" });
    const mine = document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!.getElementById("mine")!;
    expect(mine.textContent).toBe("T|M");
    expect(mine.matches(":popover-open")).toBe(true);
  });

  it("render:false is headless: events only, no DOM", async () => {
    fresh({ render: false });
    const seen: string[] = [];
    tour.on("show", (e) => seen.push(e.message));
    tour.on("dismiss", (e) => seen.push(e.reason));
    expect(await tour.show({ text: "Save changes", message: "hi" })).toMatchObject({ ok: true });
    tour.dismiss();
    expect(seen).toEqual(["hi", "hide"]);
    expect(document.querySelector("[data-webmcp-tour-root]")).toBeNull();
  });

  it("the overlay is never a match for itself", async () => {
    await tour.show({ text: "Save changes", message: "Dismiss this" });
    expect(await tour.show({ text: "Take me there", message: "m" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await tour.show({ text: "Dismiss", message: "m" })).toMatchObject({ ok: false, error: "not_found" });
  });
});
