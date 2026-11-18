// Security defaults: attribution, caps, visible-only selectors, no attribute echo.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTour } from "../src/index.js";
import type { Tour } from "../src/index.js";

const KEY = Symbol.for("webmcp-tour");
let tour: Tour;
const root = (): ShadowRoot => document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;

beforeEach(() => {
  document.body.innerHTML = `
    <form><input type="hidden" name="csrf" value="s3cr3t-token-123">
      <input id="pw" type="password" value="hunter2-secret" aria-label="Password">
      <input id="hid" type="text" value="x" style="display:none" data-secret="attr-secret-456"></form>
    <button id="save" data-token="btn-secret-789" title="Save it">Save</button>`;
  tour = createTour();
});
afterEach(() => {
  (globalThis as Record<symbol, Tour | undefined>)[KEY]?.destroy();
  document.body.innerHTML = "";
});

describe("attribution", () => {
  it("is on the card by default, whatever the caller sends", async () => {
    await tour.show({ selector: "#save", title: "Site notice", message: "From the site itself." });
    expect(root().querySelector("[part~=attribution]")!.textContent).toBe("From your assistant");
  });
});

describe("no DOM query oracle", () => {
  it("a selector on hidden or non-visible elements looks exactly like no match", async () => {
    const hidden = await tour.show({ selector: "input[name=csrf]", message: "m" });
    const none = await tour.show({ selector: "input[name=nothing-here]", message: "m" });
    const display = await tour.show({ selector: "#hid", message: "m" });
    expect(hidden).toEqual(none);
    expect(display).toEqual(none);
  });

  it("no envelope carries an attribute value or a field's value", async () => {
    const out: unknown[] = [];
    out.push(await tour.show({ selector: "#save", message: "m" }));
    out.push(await tour.show({ selector: "#pw", message: "m" }));
    out.push(await tour.show({ selector: "[data-token]", message: "m" }));
    out.push(await tour.show({ text: "nothing like it", message: "m" }));
    out.push(await tour.show({ selector: "button, input", message: "m" })); // ambiguous
    out.push(await tour.show({ selector: "##", message: "m" }));
    out.push(await tour.show({ target: "nope" }));
    const json = JSON.stringify(out);
    for (const secret of ["s3cr3t-token-123", "hunter2-secret", "attr-secret-456", "btn-secret-789"]) expect(json).not.toContain(secret);
  });
});

describe("page text handed to the agent is capped", () => {
  it("near, candidates and available are bounded in count and length", async () => {
    const long = "L".repeat(400);
    document.body.innerHTML =
      Array.from({ length: 40 }, (_, i) => `<button data-tour-id="id-${i}-${long}">Item ${i} ${long}</button>`).join("") +
      Array.from({ length: 30 }, () => `<button class="dup">Same ${long}</button>`).join("");
    const absent = await tour.show({ text: "Item", message: "m" });
    const ambiguous = await tour.show({ selector: ".dup", message: "m" });
    const missing = await tour.show({ target: "none" });
    expect(absent).toMatchObject({ ok: false });
    const near = (absent as { near?: string[] }).near ?? [];
    expect(near.length).toBeLessThanOrEqual(10);
    for (const n of near) expect(n.length).toBeLessThanOrEqual(80);
    const a = ambiguous as { candidates: { name: string }[]; count: number };
    expect(a.count).toBe(30);
    expect(a.candidates.length).toBeLessThanOrEqual(10);
    for (const c of a.candidates) expect(c.name.length).toBeLessThanOrEqual(80);
    const avail = (missing as { available: string[] }).available;
    expect(avail.length).toBeLessThanOrEqual(50);
    for (const id of avail) expect(id.length).toBeLessThanOrEqual(80);
  });
});
