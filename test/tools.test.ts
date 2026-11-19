// The tools layer against the W3C polyfill: register, list, call, embed, tear down.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, getModelContext, registerAutoTools } from "../src/index.js";
import type { AutoHandle, Tour } from "../src/index.js";

installWebMCP(); // a no-op where the browser has the API natively

type Registered = { name: string; description: string; annotations?: Record<string, boolean>; inputSchema?: Record<string, unknown> };
type Ctx = {
  getTools(): Promise<Registered[]>;
  executeTool(tool: Registered, input?: object, options?: { signal?: AbortSignal }): Promise<string>;
};
const ctx = () => (document as unknown as { modelContext: Ctx }).modelContext;
const names = async () => (await ctx().getTools()).map((t) => t.name).sort();
async function call(name: string, input: object = {}): Promise<Record<string, any>> {
  const tool = (await ctx().getTools()).find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return JSON.parse(await ctx().executeTool(tool, input));
}

const TOUR_KEY = Symbol.for("webmcp-tour");
const AUTO_KEY = Symbol.for("webmcp-tour.auto");
const INFORMED_KEY = Symbol.for("webmcp-tour.informed");
const slots = globalThis as Record<symbol, unknown>;

// A demo-like page: declared targets (attribute and, in one test, code), plain controls, an excluded one.
const PAGE = `
  <h1>Settings</h1>
  <button id="plan" data-tour-id="billing-plan" data-tour-description="Opens the plan picker.">Change plan</button>
  <button id="invoices" data-tour-id="invoices" data-tour-label="Invoices">Download invoices</button>
  <button id="save">Save changes</button>
  <button data-tour-id="secret" data-tour-exclude>Delete account</button>
  <details><summary>Advanced</summary><button data-tour-id="two-factor" data-tour-reveal="Open Advanced first.">Set up two-factor</button></details>
`;
const PLAIN = `<h1>Settings</h1><button id="save">Save changes</button><button>Cancel</button>`;

let auto: AutoHandle | undefined;
let tour: Tour;
const card = () => document.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector<HTMLElement>("[part~=popover]") ?? null;

async function start(html: string, options?: Parameters<typeof registerAutoTools>[0]): Promise<void> {
  document.body.innerHTML = html;
  tour = createTour();
  auto = registerAutoTools(options);
  await auto.ready;
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(async () => {
  auto?.stop();
  auto = undefined;
  (slots[TOUR_KEY] as Tour | undefined)?.destroy();
  delete slots[INFORMED_KEY];
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  await vi.waitFor(async () => expect(await names()).toEqual([])); // nothing outlives a test
});

describe("registration", () => {
  it("registers the tools with titles, schemas, annotations and stand-alone descriptions", async () => {
    await start(PAGE);
    const tools = await ctx().getTools();
    expect(tools.map((t) => t.name)).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    // (The polyfill fills in the other hints as false.)
    expect(by.tour_show_step!.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: false, consequentialHint: false });
    expect(by.tour_dismiss!.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: false, consequentialHint: false });
    expect(by.tour_list_targets!.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true, consequentialHint: false });
    expect(Object.keys((by.tour_show_step!.inputSchema as any).properties)).toEqual(["target", "selector", "text", "page", "index", "title", "message", "placement"]);
    // Siblings are named by interpolation, never hard-coded; nothing repeats "read-only" (bridges prepend it).
    expect(by.tour_list_targets!.description).toContain("tour_show_step");
    for (const t of tools) {
      expect(t.description.length).toBeLessThan(700);
      expect(t.description).not.toMatch(/read-only/i);
    }
  });

  it("is a singleton: a second call (script tag plus bundle) registers nothing more", async () => {
    await start(PAGE);
    const spy = vi.spyOn(ctx() as unknown as { registerTool: () => unknown }, "registerTool");
    expect(registerAutoTools()).toBe(auto);
    await auto!.ready;
    expect(spy).not.toHaveBeenCalled();
    expect(await names()).toHaveLength(4);
  });

  it("gives each registration its own AbortController, aborted on stop", async () => {
    document.body.innerHTML = PAGE;
    const mc = ctx() as unknown as { registerTool(t: unknown, o?: { signal?: AbortSignal }): Promise<unknown> };
    const signals: AbortSignal[] = [];
    const orig = mc.registerTool.bind(mc);
    vi.spyOn(mc, "registerTool").mockImplementation((t, o) => (o?.signal && signals.push(o.signal), orig(t, o)));
    tour = createTour();
    auto = registerAutoTools();
    await auto.ready;
    expect(signals).toHaveLength(4);
    expect(new Set(signals).size).toBe(4);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    auto.stop();
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(await names()).toEqual([]);
    expect(slots[AUTO_KEY]).toBeUndefined();
  });

  it("stop() beats a pending registration and the observer: nothing registers afterwards", async () => {
    document.body.innerHTML = PLAIN;
    tour = createTour();
    auto = registerAutoTools();
    auto.stop(); // before the first registerTool settles
    await auto.ready;
    document.body.insertAdjacentHTML("beforeend", `<button data-tour-id="late">Late</button>`);
    await new Promise((r) => setTimeout(r, 400));
    expect(await names()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled(); // an abort is not a failure
  });

  it("skips a name the page already registered, says so, and registers the rest", async () => {
    document.body.innerHTML = PAGE;
    const own = new AbortController();
    await (ctx() as any).registerTool({ name: "tour_dismiss", description: "mine", execute: async () => ({ mine: true }) }, { signal: own.signal });
    tour = createTour();
    auto = registerAutoTools();
    await auto.ready;
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
    expect(await call("tour_dismiss")).toEqual({ mine: true });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String((console.warn as any).mock.calls[0][0])).toContain("tour_dismiss");
    own.abort();
  });

  it("custom names through registerAutoTools", async () => {
    await start(PAGE, { names: { showStep: "point_at", dismiss: "unpoint", listTargets: "pointables" } });
    expect(await names()).toEqual(["point_at", "pointables", "tour_wait_for_interaction", "unpoint"]);
    expect((await ctx().getTools()).find((t) => t.name === "pointables")!.description).toContain("point_at");
  });
});

describe("list_targets registration", () => {
  it("is registered with zero declared targets or pages, and reports the outline", async () => {
    await start(PLAIN);
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
    const r = await call("tour_list_targets");
    expect(r).toMatchObject({ ok: true, targets: [], count: 0 });
    expect(r.outline.headings).toEqual(["Settings"]);
    expect(r.outline.controls.map((c: any) => c.name)).toEqual(["Save changes", "Cancel"]);
  });

  it("sees targets declared later, without re-registering", async () => {
    await start(PLAIN);
    document.body.insertAdjacentHTML("beforeend", `<button id="t" data-tour-id="late" data-tour-description="d">Late</button>`);
    expect((await call("tour_list_targets")).targets.map((t: any) => t.id)).toEqual(["late"]);
    const off = tour.defineTarget({ id: "save", selector: "#save", description: "Saves." });
    expect((await call("tour_list_targets")).targets.map((t: any) => t.id)).toEqual(["save", "late"]);
    off();
    expect(await names()).toHaveLength(4);
  });
});

describe("calling the tools", () => {
  it("lists and calls all four against a demo-like page", async () => {
    await start(PAGE);

    const listed = await call("tour_list_targets");
    expect(listed).toMatchObject({ ok: true, count: 3 }); // the data-tour-exclude one is off-limits
    expect(listed.targets).toEqual([
      { id: "billing-plan", label: "Change plan", description: "Opens the plan picker.", visible: true },
      { id: "invoices", label: "Invoices", visible: true },
      { id: "two-factor", label: "Set up two-factor", reveal: "Open Advanced first.", visible: false },
    ]);

    const shown = await call("tour_show_step", { target: "billing-plan" });
    expect(shown).toMatchObject({ ok: true, matched: { by: "target", tag: "button", name: "change plan" } });
    expect(card()!.textContent).toContain("Opens the plan picker.");

    expect(await call("tour_show_step", { selector: "#save", message: "Save here.", title: "Save" })).toMatchObject({ ok: true, matched: { by: "selector" } });
    expect(card()!.textContent).toContain("Save here.");

    expect(await call("tour_dismiss")).toEqual({ ok: true, dismissed: true });
    expect(card()?.matches(":popover-open") ?? false).toBe(false);
  });

  it("points by text on a page with zero declared targets", async () => {
    await start(PLAIN);
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
    const r = await call("tour_show_step", { text: "Save changes", message: "Click this to save." });
    expect(r).toMatchObject({ ok: true, matched: { by: "text", tag: "button", name: "save changes" } });
    expect(r.isError).toBeUndefined();
    expect(card()!.textContent).toContain("Click this to save.");
    expect(r.note).toBe("The highlight stays until dismissed. Call tour_dismiss when the user moves on.");
  });

  it("show_step guides the agent: absent controls, locator preference, renamed dismiss in the note", async () => {
    await start(PLAIN);
    const d = (await ctx().getTools()).find((t) => t.name === "tour_show_step")!.description;
    expect(d).toContain("check tour_list_targets for this page and others; do not highlight a guess");
    expect(d).toContain("Prefer `text` or `target`; use `selector` only for something you saw in the page snapshot");
    expect(d.length).toBeLessThan(700);
    const failed = await call("tour_show_step", { text: "No such control", message: "x" });
    expect(failed).toMatchObject({ ok: false, error: "not_found", isError: true });
    expect(failed.near).toBeInstanceOf(Array);
    expect(failed.note).toBeUndefined();
  });

  it("returns failures as envelopes with isError, and never rejects", async () => {
    await start(PAGE);
    const cases: [object, string][] = [
      [{ text: "Nothing like this", message: "m" }, "not_found"],
      [{ target: "nope" }, "target_not_found"],
      [{ selector: "##", message: "m" }, "invalid_selector"],
      [{ selector: "#save" }, "invalid_input"], // message missing
      [{ text: "a", selector: "b", message: "m" }, "invalid_input"],
      [{ message: "m" }, "invalid_input"],
      [{ text: 5, message: "m" }, "invalid_input"],
      [{ target: "two-factor" }, "not_visible"],
    ];
    for (const [input, error] of cases) {
      expect(await call("tour_show_step", input), JSON.stringify(input)).toMatchObject({ ok: false, error, isError: true });
    }
    document.body.insertAdjacentHTML("beforeend", `<button>Save changes</button>`);
    expect(await call("tour_show_step", { text: "Save changes", message: "m" })).toMatchObject({ ok: false, error: "ambiguous", isError: true });
    expect(await call("tour_show_step", { text: "Save changes", message: "m", index: 1 })).toMatchObject({ ok: true });
  });

  it("turns an unexpected throw into an envelope", async () => {
    await start(PAGE);
    vi.spyOn(tour, "show").mockRejectedValue(new Error("boom"));
    expect(await call("tour_show_step", { text: "Save changes", message: "m" })).toMatchObject({ ok: false, error: "internal", isError: true });
  });
});

describe("embedding", () => {
  it("registers tour.tools({ names }) by hand under your own names", async () => {
    document.body.innerHTML = PAGE;
    tour = createTour();
    const defs = tour.tools({ names: { showStep: "settings_point_at", dismiss: "settings_clear_point" } });
    expect(defs.map((d) => d.name)).toEqual(["settings_point_at", "tour_list_targets", "settings_clear_point", "tour_wait_for_interaction"]);
    const mc = getModelContext()!;
    const stop = new AbortController();
    for (const def of defs) await mc.registerTool(def, { signal: stop.signal });

    expect(await names()).toEqual(["settings_clear_point", "settings_point_at", "tour_list_targets", "tour_wait_for_interaction"]);
    expect((await ctx().getTools()).find((t) => t.name === "tour_list_targets")!.description).toContain("settings_point_at");
    expect((await ctx().getTools()).find((t) => t.name === "tour_wait_for_interaction")!.description).toContain("settings_point_at");
    expect(await call("settings_point_at", { text: "Save changes", message: "Here." })).toMatchObject({ ok: true, note: expect.stringContaining("settings_clear_point") });
    expect(await call("settings_clear_point")).toEqual({ ok: true, dismissed: true });
    stop.abort();
  });

  it("rejects bad names up front (a programmer error) and registers nothing itself", async () => {
    tour = createTour();
    expect(() => tour.tools({ names: { showStep: "has space" } })).toThrow(TypeError);
    expect(() => tour.tools({ names: { showStep: "same", dismiss: "same" } })).toThrow(TypeError);
    expect(() => tour.tools({ names: { showStep: "x".repeat(58) } })).toThrow(TypeError);
    tour.tools();
    expect(await names()).toEqual([]);
  });

  it("a tool you wrap yourself can call tour.show", async () => {
    document.body.innerHTML = PLAIN;
    tour = createTour();
    const stop = new AbortController();
    await getModelContext()!.registerTool(
      { name: "change_plan", title: "t", description: "Switch plan.", inputSchema: { type: "object" }, annotations: { readOnlyHint: true }, execute: async () => ({ ...(await tour.show({ text: "Save changes", message: "Confirm here." })) }) },
      { signal: stop.signal },
    );
    expect(await call("change_plan")).toMatchObject({ ok: true });
    stop.abort();
  });
});

describe("getModelContext", () => {
  const secure = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext")!;
  const strip = (key: string) => Object.defineProperty(document, key, { value: undefined, configurable: true });
  afterEach(() => {
    delete (document as any).modelContext;
    delete (navigator as any).modelContext;
    Object.defineProperty(globalThis, "isSecureContext", secure);
  });

  it("returns document.modelContext", () => {
    expect(getModelContext()).toBe(ctx());
  });

  it("falls back to the legacy navigator.modelContext", () => {
    strip("modelContext");
    const legacy = { registerTool: async () => {} };
    Object.defineProperty(navigator, "modelContext", { value: legacy, configurable: true });
    expect(getModelContext()).toBe(legacy);
  });

  it("returns null with one console.info naming the reason, once per page", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    strip("modelContext");
    expect(getModelContext()).toBeNull();
    expect(getModelContext()).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]![0])).toMatch(/no WebMCP API/);
  });

  it("names an insecure context", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    strip("modelContext");
    Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true });
    expect(getModelContext()).toBeNull();
    expect(String(info.mock.calls[0]![0])).toMatch(/secure context/);
  });

  it("names the Permissions-Policy when it blocks the tools feature", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    strip("modelContext");
    Object.defineProperty(document, "permissionsPolicy", { value: { features: () => ["tools"], allowsFeature: () => false }, configurable: true });
    try {
      expect(getModelContext()).toBeNull();
      expect(String(info.mock.calls[0]![0])).toMatch(/Permissions-Policy/);
    } finally {
      delete (document as any).permissionsPolicy;
    }
  });

  it("registerAutoTools is a quiet no-op without the API, and a later call can still register", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    strip("modelContext");
    document.body.innerHTML = PLAIN;
    const h = registerAutoTools();
    await h.ready;
    h.stop();
    expect(slots[AUTO_KEY]).toBeUndefined();
    delete (document as any).modelContext;
    auto = registerAutoTools();
    await auto.ready;
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
  });
});

describe("entries", () => {
  it("the root entry does no DOM work at import and registers nothing", async () => {
    vi.resetModules();
    const registerTool = vi.spyOn(ctx() as unknown as { registerTool: () => unknown }, "registerTool");
    await import("../src/index.js");
    expect(registerTool).not.toHaveBeenCalled();
    expect(slots[AUTO_KEY]).toBeUndefined();
    expect(slots[TOUR_KEY]).toBeUndefined();
    expect(document.querySelector("[data-webmcp-tour-root]")).toBeNull();
  });

  it("webmcp-tour/auto registers on import", async () => {
    vi.resetModules();
    document.body.innerHTML = PLAIN;
    await import("../src/auto.js");
    auto = slots[AUTO_KEY] as AutoHandle;
    await auto.ready;
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
  });
});
