// The tools layer against the W3C polyfill: register, list, call, embed, tear down.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, getModelContext, registerAsWebMcpTool } from "../src/index.js";
import type { Registration, Tour, TourOptions } from "../src/index.js";

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

let reg: Registration | undefined;
let tour: Tour;
const card = () => document.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector<HTMLElement>("[part~=popover]") ?? null;

async function start(html: string, options?: TourOptions): Promise<void> {
  document.body.innerHTML = html;
  tour = createTour(options);
  reg = await registerAsWebMcpTool(tour);
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(async () => {
  reg?.unregister();
  reg = undefined;
  tour?.destroy();
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

  it("a second registration of the same tour rejects, the first stays", async () => {
    await start(PAGE);
    await expect(registerAsWebMcpTool(tour)).rejects.toThrow();
    expect(await names()).toHaveLength(4);
    reg!.unregister();
    expect(await names()).toEqual([]);
  });

  it("gives each registration its own AbortController, aborted on stop", async () => {
    document.body.innerHTML = PAGE;
    const mc = ctx() as unknown as { registerTool(t: unknown, o?: { signal?: AbortSignal }): Promise<unknown> };
    const signals: AbortSignal[] = [];
    const orig = mc.registerTool.bind(mc);
    vi.spyOn(mc, "registerTool").mockImplementation((t, o) => (o?.signal && signals.push(o.signal), orig(t, o)));
    tour = createTour();
    reg = await registerAsWebMcpTool(tour);
    expect(signals).toHaveLength(4);
    expect(new Set(signals).size).toBe(4);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    reg.unregister();
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(await names()).toEqual([]);
  });

  it("unregister() beats a pending registration: nothing registers afterwards", async () => {
    document.body.innerHTML = PLAIN;
    tour = createTour();
    const pending = registerAsWebMcpTool(tour);
    // Registration has started but not settled: unregister once the call returns.
    (await pending).unregister();
    await new Promise((r) => setTimeout(r, 400));
    expect(await names()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled(); // an abort is not a failure
  });

  it("rejects when the page already registered one of the names, and registers none of the rest", async () => {
    document.body.innerHTML = PAGE;
    const own = new AbortController();
    await (ctx() as any).registerTool({ name: "tour_dismiss", description: "mine", execute: async () => ({ mine: true }) }, { signal: own.signal });
    tour = createTour();
    await expect(registerAsWebMcpTool(tour)).rejects.toThrow();
    expect(await names()).toEqual(["tour_dismiss"]);
    expect(await call("tour_dismiss")).toEqual({ mine: true });
    own.abort();
  });

  it("custom names through createTour({ names })", async () => {
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

  it("registerAsWebMcpTool is a quiet no-op without the API, and a later call can still register", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    strip("modelContext");
    document.body.innerHTML = PLAIN;
    tour = createTour();
    const h = await registerAsWebMcpTool(tour);
    await registerAsWebMcpTool(tour);
    h.unregister();
    expect(info).toHaveBeenCalledTimes(1);
    delete (document as any).modelContext;
    reg = await registerAsWebMcpTool(tour);
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
  });
});

describe("registerAsWebMcpTool", () => {
  const FOUR = ["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"];

  it("registers one tour", async () => {
    document.body.innerHTML = PLAIN;
    const t = createTour();
    const h = await registerAsWebMcpTool(t);
    expect(await names()).toEqual(FOUR);
    h.unregister();
    expect(await names()).toEqual([]);
    t.destroy();
  });

  it("registers an array of tours under prefixes and names, each driving its own tour", async () => {
    document.body.innerHTML = PLAIN;
    const a = createTour({ toolPrefix: "billing" });
    const b = createTour({ names: { showStep: "point_at", listTargets: "what_is_here", dismiss: "unpoint", waitForInteraction: "wait_for_user" } });
    const h = await registerAsWebMcpTool([a, b]);
    expect(await names()).toEqual(["billing_dismiss", "billing_list_targets", "billing_show_step", "billing_wait_for_interaction", "point_at", "unpoint", "wait_for_user", "what_is_here"]);
    expect((await ctx().getTools()).find((t) => t.name === "billing_list_targets")!.description).toContain("billing_show_step");
    const ev: string[] = [];
    a.on("show", () => ev.push("a"));
    b.on("show", () => ev.push("b"));
    await call("billing_show_step", { text: "Save changes", message: "m" });
    await call("point_at", { text: "Cancel", message: "m" });
    expect(ev).toEqual(["a", "b"]);
    h.unregister();
    expect(await names()).toEqual([]);
    a.destroy();
    b.destroy();
  });

  it("throws a clear error on duplicate names across tours, before registering anything", async () => {
    const a = createTour({ toolPrefix: "x" });
    const b = createTour({ toolPrefix: "x" });
    const c = createTour(); // default names
    const d = createTour(); // default names again
    await expect(registerAsWebMcpTool([a, b])).rejects.toThrow(/more than one tool is named "x_show_step"/);
    await expect(registerAsWebMcpTool([c, a, d])).rejects.toThrow(TypeError);
    expect(await names()).toEqual([]);
    for (const t of [a, b, c, d]) t.destroy();
  });

  it("rejects a bad prefix up front", async () => {
    const t = createTour({ toolPrefix: "has space" });
    await expect(registerAsWebMcpTool(t)).rejects.toThrow(TypeError);
    t.destroy();
  });

  it("unregisters when the signal aborts, and registers nothing for an aborted signal", async () => {
    document.body.innerHTML = PLAIN;
    const t = createTour();
    const ctl = new AbortController();
    await registerAsWebMcpTool(t, { signal: ctl.signal });
    expect(await names()).toEqual(FOUR);
    ctl.abort();
    expect(await names()).toEqual([]);
    await registerAsWebMcpTool(t, { signal: ctl.signal });
    expect(await names()).toEqual([]);
    t.destroy();
  });

  it("unregister is idempotent and registering again afterwards works", async () => {
    const t = createTour();
    const h = await registerAsWebMcpTool(t);
    h.unregister();
    h.unregister();
    reg = await registerAsWebMcpTool(t);
    expect(await names()).toEqual(FOUR);
    t.destroy();
  });
});

describe("entries", () => {
  it("the root entry does no DOM work at import and registers nothing", async () => {
    vi.resetModules();
    const registerTool = vi.spyOn(ctx() as unknown as { registerTool: () => unknown }, "registerTool");
    await import("../src/index.js");
    expect(registerTool).not.toHaveBeenCalled();
    expect(document.querySelector("[data-webmcp-tour-root]")).toBeNull();
  });
});
