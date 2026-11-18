// axe-core on a demo-like page with the tour showing, plus the announcement and keyboard flows through createTour.
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTour } from "../src/index.js";
import type { Tour } from "../src/index.js";
import { emulateMedia } from "./helpers.js";

const KEY = Symbol.for("webmcp-tour");
let tour: Tour;
const PAGE = `
  <header><nav aria-label="Primary"><a href="#top">Home</a></nav></header>
  <main>
    <h1>Account</h1>
    <section aria-label="Billing"><h2>Billing</h2>
      <p>Your plan renews monthly.</p>
      <button id="plan">Change plan</button>
      <button id="save">Save changes</button>
    </section>
    <label>Email <input id="mail" type="email"></label>
  </main>`;
const root = (): ShadowRoot => document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
const q = <T extends HTMLElement>(p: string) => root().querySelector<T>(`[part~=${p}]`)!;
const live = () => q("live").textContent;
const poll = <T>(fn: () => T) => expect.poll(fn, { timeout: 1000 });

beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Account";
  document.body.innerHTML = PAGE;
  tour = createTour({ takeMeThere: true });
});
afterEach(async () => {
  (globalThis as Record<symbol, Tour | undefined>)[KEY]?.destroy();
  document.body.innerHTML = "";
  await emulateMedia({ forcedColors: null, reducedMotion: null });
});

async function violations(): Promise<string[]> {
  const r = await axe.run(document, { rules: { region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

describe("axe-core", () => {
  it("page without a step: no violations, live region present", async () => {
    expect(await violations()).toEqual([]);
    expect(q("live")).toBeTruthy();
  });

  it("with a step showing (default theme)", async () => {
    await tour.show({ text: "Change plan", title: "Plans", message: "Opens the plan picker." });
    expect(q("popover").matches(":popover-open")).toBe(true);
    expect(await violations()).toEqual([]);
  });

  it("with a step showing in forced-colors", async () => {
    await emulateMedia({ forcedColors: "active" });
    await tour.show({ text: "Save changes", message: "Click to save." });
    expect(await violations()).toEqual([]);
  });

  it("with describeTarget on", async () => {
    tour.destroy();
    tour = createTour({ describeTarget: true });
    await tour.show({ text: "Change plan", message: "Opens the plan picker." });
    expect(await violations()).toEqual([]);
  });
});

describe("announcement", () => {
  it("says the message, the accessible name and the landmark", async () => {
    await tour.show({ text: "Change plan", message: "Opens the plan picker." });
    await poll(live).toBe("Opens the plan picker. — Change plan, Billing");
    await tour.show({ selector: "#mail", message: "Type it here." });
    await poll(live).toBe("Type it here. — Email, main");
  });

  it("clears when dismissed", async () => {
    await tour.show({ text: "Change plan", message: "m" });
    await poll(live).not.toBe("");
    tour.dismiss();
    expect(live()).toBe("");
  });

  it("is mounted at creation, before anything is shown", () => {
    expect(q("live").textContent).toBe("");
    expect(q("popover")).toBeNull();
  });
});

describe("keyboard only", () => {
  it("Tab reaches Take me there then Dismiss; Enter on Take me there focuses the target; Escape dismisses", async () => {
    await tour.show({ text: "Save changes", message: "Click to save." });
    q<HTMLElement>("close").focus(); // source order: close, Got it, Take me there
    await userEvent.tab();
    expect(root().activeElement).toBe(q("gotit"));
    await userEvent.tab();
    expect(root().activeElement).toBe(q("goto"));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(document.getElementById("save"));
    await userEvent.keyboard("{Escape}");
    expect(q("popover").matches(":popover-open")).toBe(false);
  });

  it("Escape from inside the card dismisses even when the page prevents it", async () => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("keydown", prevent, true);
    await tour.show({ text: "Save changes", message: "m" });
    q<HTMLElement>("goto").focus();
    await userEvent.keyboard("{Escape}");
    document.removeEventListener("keydown", prevent, true);
    expect(q("popover").matches(":popover-open")).toBe(false);
  });

  it("Escape on the page does not dismiss when the app's own handler claims it", async () => {
    document.getElementById("mail")!.addEventListener("keydown", (e) => e.key === "Escape" && e.preventDefault());
    await tour.show({ selector: "#mail", message: "m" });
    document.getElementById("mail")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(q("popover").matches(":popover-open")).toBe(true);
  });

  it("the card never takes focus by itself", async () => {
    document.getElementById("plan")!.focus();
    await tour.show({ text: "Save changes", message: "m" });
    expect(document.activeElement).toBe(document.getElementById("plan"));
  });

  it("Dismiss is operable with the keyboard", async () => {
    await tour.show({ text: "Save changes", message: "m" });
    q<HTMLElement>("close").focus();
    await userEvent.keyboard("{Enter}");
    expect(q("popover").matches(":popover-open")).toBe(false);
  });
});
