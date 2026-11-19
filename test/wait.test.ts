// tour_wait_for_interaction: real input, teardown on every exit, nothing leaks.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { commands } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, registerAsWebMcpTool } from "../src/index.js";
import type { Registration, Tour, WaitResult } from "../src/index.js";

installWebMCP(); // a no-op where the browser has the API natively

const input = commands as unknown as {
  waitInput(selector: string, action: "press" | "force" | "key" | "type" | "blur", arg?: string | number): Promise<void>;
  windowListeners(types: string[]): Promise<number>;
};
type Registered = { name: string };
type Ctx = { getTools(): Promise<Registered[]>; executeTool(tool: Registered, input?: object, options?: { signal?: AbortSignal }): Promise<string> };
const ctx = () => (document as unknown as { modelContext: Ctx }).modelContext;
const tool = async (name: string) => (await ctx().getTools()).find((t) => t.name === name)!;

const TYPES = ["pointerdown", "click", "change"];
const slots = globalThis as Record<symbol, unknown>;
const PAGE = `
  <h1>Settings</h1>
  <a id="docs" href="#docs">Docs</a>
  <button id="save">Save changes</button>
  <button id="cancel">Cancel</button>
  <button id="far" style="position: fixed; left: 600px; top: 500px">Far away</button>
  <label>Email <input id="email" type="text"></label>
  <label>Password <input id="pw" type="password"></label>
  <label>Plan <select id="plan"><option>Free</option><option>Team</option></select></label>
`;

// What the page's window holds, counted in the page itself (every browser) ...
const live = new Map<string, number>();
const realAdd = window.addEventListener;
const realRemove = window.removeEventListener;
const total = () => [...live.values()].reduce((a, b) => a + b, 0);
// ... and by the browser (Chromium: DevTools' own count; -1 elsewhere).
const browserCount = () => input.windowListeners(TYPES);

let tour: Tour;
let reg: Registration | undefined;
const el = (id: string) => document.getElementById(id)!;
const card = () => document.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector<HTMLElement>("[part~=popover]") ?? null;
const show = (id: string) => tour.show({ selector: `#${id}`, message: "Do this." });
const settled = async (p: Promise<unknown>, ms = 120) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  document.body.innerHTML = PAGE;
  tour = createTour();
  live.clear();
  const held = new Set<string>();
  const id = new WeakMap<object, number>();
  let n = 0;
  const tag = (t: string, cb: unknown) => {
    if (!id.has(cb as object)) id.set(cb as object, ++n);
    return `${t}:${id.get(cb as object)}`;
  };
  const capture = (o: unknown) => (typeof o === "boolean" ? o : Boolean((o as { capture?: boolean } | undefined)?.capture));
  window.addEventListener = function (this: Window, t: string, cb: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    if (TYPES.includes(t) && capture(o)) held.add(tag(t, cb)), live.set("all", held.size);
    return realAdd.call(this, t, cb, o);
  } as typeof window.addEventListener;
  window.removeEventListener = function (this: Window, t: string, cb: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) {
    if (TYPES.includes(t) && capture(o)) held.delete(tag(t, cb)), live.set("all", held.size);
    return realRemove.call(this, t, cb, o);
  } as typeof window.removeEventListener;
});
afterEach(() => {
  window.addEventListener = realAdd;
  window.removeEventListener = realRemove;
  reg?.unregister();
  reg = undefined;
  tour?.destroy();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("what counts as the step", () => {
  it("a real press (mouse down, 80 ms, mouse up) on the highlighted button resolves it, naming the element", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    await input.waitInput("#save", "press", 80);
    expect(await w).toEqual({ ok: true, status: "interacted", event: "click", target: { tag: "button", name: "save changes" } });
    expect(total()).toBe(0);
  });

  it("resolves on pointerdown, before the click: the result is out ahead of any navigation", async () => {
    await show("save");
    const order: string[] = [];
    document.addEventListener("click", () => order.push("click"));
    const w = tour.waitForInteraction().then((r) => (order.push("settled"), r));
    await input.waitInput("#save", "press", 150);
    await w;
    expect(order).toEqual(["settled", "click"]);
  });

  it("keyboard Enter (a click with no pointerdown) resolves it too", async () => {
    await show("docs");
    const w = tour.waitForInteraction();
    await input.waitInput("#docs", "key", "Enter");
    expect(await w).toMatchObject({ status: "interacted", event: "click", target: { tag: "a", name: "docs" } });
  });

  it("an element named in the call wins over the highlighted one; others are ignored", async () => {
    await show("save");
    const w = tour.waitForInteraction({ text: "Cancel" });
    await input.waitInput("#save", "press", 40);
    expect(await settled(w)).toBe(false);
    await input.waitInput("#cancel", "press", 40);
    expect(await w).toMatchObject({ status: "interacted", target: { name: "cancel" } });
  });

  it("only the primary button counts", async () => {
    await show("save");
    const w = tour.waitForInteraction({}, { timeoutMs: 200 });
    el("save").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 2 }));
    expect(await w).toEqual({ ok: true, status: "timeout" });
  });

  it("a disabled control is not an interaction", async () => {
    await show("save");
    const w = tour.waitForInteraction({}, { timeoutMs: 250 });
    (el("save") as HTMLButtonElement).disabled = true;
    await input.waitInput("#save", "force", 40); // real mouse events at its position
    expect(await w).toEqual({ ok: true, status: "timeout" });
  });

  it("ignores script-made events: el.click(), dispatched pointerdown and change", async () => {
    await show("save");
    const w = tour.waitForInteraction({}, { timeoutMs: 250 });
    el("save").click();
    el("save").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0 }));
    el("save").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(await w).toEqual({ ok: true, status: "timeout" });
  });

  it("survives a re-render: the node is replaced mid-wait and the new one is pressed", async () => {
    await show("far");
    const w = tour.waitForInteraction();
    const old = el("far");
    old.replaceWith(old.cloneNode(true));
    expect(old.isConnected).toBe(false);
    await input.waitInput("#far", "press", 60);
    expect(await w).toMatchObject({ status: "interacted", target: { name: "far away" } });
  });

  it("survives the app stopping propagation on the target", async () => {
    await show("save");
    for (const t of ["pointerdown", "click"]) el("save").addEventListener(t, (e) => e.stopPropagation());
    const w = tour.waitForInteraction();
    await input.waitInput("#save", "press", 60);
    expect(await w).toMatchObject({ status: "interacted" });
  });
});

describe("fields", () => {
  it("wait for `change`, not `input`, and never return what was typed", async () => {
    await show("pw");
    const w = tour.waitForInteraction();
    await input.waitInput("#pw", "type", "hunter2-secret");
    expect(await settled(w, 150)).toBe(false); // 14 keystrokes, no step yet
    await input.waitInput("#pw", "blur");
    const r = await w;
    expect(r).toEqual({ ok: true, status: "interacted", event: "change", target: { tag: "input", name: "password" } });
    expect(JSON.stringify(r)).not.toContain("hunter2");
  });

  it("a text field with a value in it still reports only its name", async () => {
    (el("email") as HTMLInputElement).value = "sam@example.com";
    await show("email");
    const w = tour.waitForInteraction();
    await input.waitInput("#email", "type", "x");
    await input.waitInput("#email", "blur");
    expect(JSON.stringify(await w)).not.toContain("sam@example.com");
  });

  it("a select resolves on change", async () => {
    await show("plan");
    const w = tour.waitForInteraction();
    expect(await settled(w, 80)).toBe(false);
    const s = el("plan") as HTMLSelectElement;
    s.focus();
    await input.waitInput("#plan", "key", "ArrowDown");
    expect(await w).toMatchObject({ status: "interacted", event: "change", target: { tag: "select", name: "plan" } });
  });

  it("`events` overrides the default", async () => {
    await show("email");
    const w = tour.waitForInteraction({ events: ["click"] });
    await input.waitInput("#email", "press", 40);
    expect(await w).toMatchObject({ status: "interacted", event: "click" });
  });
});

describe("one wait at a time, and it always lets go", () => {
  it("a press releases the listeners", async () => {
    await show("save");
    const before = await browserCount();
    const w = tour.waitForInteraction();
    expect(total()).toBe(2);
    if (before >= 0) expect(await browserCount()).toBe(before + 2);
    await input.waitInput("#save", "press", 40);
    await w;
    expect(total()).toBe(0);
    if (before >= 0) expect(await browserCount()).toBe(before);
  });

  it("the internal deadline is a success, the highlight stays, and the listeners go", async () => {
    await show("save");
    const before = await browserCount();
    const w = tour.waitForInteraction({}, { timeoutMs: 150 });
    expect(total()).toBe(2);
    expect(await w).toEqual({ ok: true, status: "timeout" });
    expect(total()).toBe(0);
    if (before >= 0) expect(await browserCount()).toBe(before);
    expect(card()!.matches(":popover-open")).toBe(true);
    expect(tour.dismiss()).toEqual({ ok: true, dismissed: true });
  });

  it("the default deadline is 20 seconds", async () => {
    await show("save");
    vi.useFakeTimers();
    const w = tour.waitForInteraction();
    let out: WaitResult | undefined;
    void w.then((r) => (out = r));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(out).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(out).toEqual({ ok: true, status: "timeout" });
  });

  it("an abort releases the listeners", async () => {
    await show("save");
    const before = await browserCount();
    const ctl = new AbortController();
    const w = tour.waitForInteraction({}, { signal: ctl.signal });
    expect(total()).toBe(2);
    ctl.abort();
    expect(await w).toMatchObject({ ok: false, error: "cancelled" });
    expect(total()).toBe(0);
    if (before >= 0) expect(await browserCount()).toBe(before);
    await input.waitInput("#save", "press", 40); // a later press resolves nothing
  });

  it("an already-aborted signal listens to nothing", async () => {
    await show("save");
    const r = await tour.waitForInteraction({}, { signal: AbortSignal.abort() });
    expect(r).toMatchObject({ ok: false, error: "cancelled" });
    expect(total()).toBe(0);
  });

  it("a new wait supersedes the pending one", async () => {
    await show("save");
    const before = await browserCount();
    const first = tour.waitForInteraction();
    const second = tour.waitForInteraction({ text: "Cancel" });
    expect(await first).toEqual({ ok: true, status: "superseded" });
    expect(total()).toBe(2); // only the second is listening
    if (before >= 0) expect(await browserCount()).toBe(before + 2);
    await input.waitInput("#cancel", "press", 40);
    expect(await second).toMatchObject({ status: "interacted" });
    expect(total()).toBe(0);
    if (before >= 0) expect(await browserCount()).toBe(before);
  });

  it("a new show supersedes the pending wait", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    await show("cancel");
    expect(await w).toEqual({ ok: true, status: "superseded" });
    expect(total()).toBe(0);
    // ... and a bare wait now follows the new step.
    const next = tour.waitForInteraction();
    await input.waitInput("#cancel", "press", 40);
    expect(await next).toMatchObject({ target: { name: "cancel" } });
  });

  it("a failed show leaves the wait alone", async () => {
    await show("save");
    const w = tour.waitForInteraction({}, { timeoutMs: 200 });
    expect(await tour.show({ selector: "#nope", message: "x" })).toMatchObject({ ok: false });
    expect(await w).toEqual({ ok: true, status: "timeout" });
  });

  it("destroy settles the pending wait", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    tour.destroy();
    expect(await w).toEqual({ ok: true, status: "superseded" });
    expect(total()).toBe(0);
  });

  it("× on the card settles the wait as dismissed, and nothing stays listening", async () => {
    await show("save");
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    const w = tour.waitForInteraction();
    card()!.querySelector<HTMLElement>("[part~=close]")!.click();
    expect(await settled(w, 500)).toBe(true);
    expect(await w).toEqual({ ok: true, status: "dismissed" });
    expect(reasons).toEqual(["closed"]);
    expect(total()).toBe(0);
  });

  it("Escape settles the wait as dismissed", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await w).toEqual({ ok: true, status: "dismissed" });
    expect(total()).toBe(0);
  });

  it("tour.dismiss() settles the wait as superseded and releases its listeners", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    tour.dismiss();
    expect(await w).toEqual({ ok: true, status: "superseded" });
    expect(total()).toBe(0);
    await input.waitInput("#save", "press", 20); // the old wait must not report this
  });

  it("a modal opening settles the wait as obscured", async () => {
    await show("save");
    const w = tour.waitForInteraction();
    const dlg = document.createElement("dialog");
    dlg.innerHTML = "<p>Sure?</p>";
    document.body.append(dlg);
    dlg.showModal();
    expect(await w).toMatchObject({ ok: false, error: "obscured" });
    expect(total()).toBe(0);
    dlg.close();
  });

  it("a wait that cannot resolve its element does not supersede the pending one", async () => {
    await show("save");
    const w = tour.waitForInteraction({}, { timeoutMs: 200 });
    expect(await tour.waitForInteraction({ selector: "#nope" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await w).toEqual({ ok: true, status: "timeout" });
  });
});

describe("errors", () => {
  it("asks for a step when nothing is highlighted and nothing is named", async () => {
    expect(await tour.waitForInteraction()).toMatchObject({ ok: false, error: "no_step" });
    await show("save");
    tour.dismiss();
    expect(await tour.waitForInteraction()).toMatchObject({ ok: false, error: "no_step" });
  });

  it("rejects bad input as invalid_input", async () => {
    await show("save");
    for (const bad of [{ events: [] }, { events: ["input"] }, { events: "click" }, { selector: "#save", text: "Save" }, { index: -1, text: "Save" }])
      expect(await tour.waitForInteraction(bad as never), JSON.stringify(bad)).toMatchObject({ ok: false, error: "invalid_input" });
    expect(total()).toBe(0);
  });
});

describe("through the registered tool", () => {
  async function start(): Promise<void> {
    reg = await registerAsWebMcpTool(tour);
  }

  it("is registered, read-only, and resolves on a real press", async () => {
    await start();
    const t = (await ctx().getTools()).find((x) => x.name === "tour_wait_for_interaction") as Registered & { annotations: object; description: string };
    expect(t.annotations).toMatchObject({ readOnlyHint: true });
    expect(t.description).toContain("tour_show_step");
    expect(t.description).toContain("check the page");
    expect(t.description.length).toBeLessThan(700);
    await show("save");
    const run = ctx().executeTool(t, {});
    await input.waitInput("#save", "press", 80);
    expect(JSON.parse(await run)).toEqual({ ok: true, status: "interacted", event: "click", target: { tag: "button", name: "save changes" } });
  });

  it("the host's execution-time signal tears the wait down", async () => {
    await start();
    await show("save");
    const before = await browserCount();
    const ctl = new AbortController();
    const run = ctx().executeTool(await tool("tour_wait_for_interaction"), {}, { signal: ctl.signal });
    await vi.waitFor(() => expect(total()).toBe(2));
    ctl.abort();
    await expect(run).rejects.toBeTruthy();
    await vi.waitFor(() => expect(total()).toBe(0));
    if (before >= 0) expect(await browserCount()).toBe(before);
  });

  it("a retry after a host that gave up without aborting supersedes the orphan", async () => {
    await start();
    await show("save");
    const t = await tool("tour_wait_for_interaction");
    const orphan = ctx().executeTool(t, {});
    await vi.waitFor(() => expect(total()).toBe(2));
    const retry = ctx().executeTool(t, {});
    expect(JSON.parse(await orphan)).toEqual({ ok: true, status: "superseded" });
    expect(total()).toBe(2);
    await input.waitInput("#save", "press", 40);
    expect(JSON.parse(await retry)).toMatchObject({ status: "interacted" });
    expect(total()).toBe(0);
  });

  it("failures are envelopes with isError", async () => {
    await start();
    expect(JSON.parse(await ctx().executeTool(await tool("tour_wait_for_interaction"), {}))).toMatchObject({ ok: false, error: "no_step", isError: true });
  });

  it("tour_show_step supersedes a wait pending through the tool", async () => {
    await start();
    await show("save");
    const run = ctx().executeTool(await tool("tour_wait_for_interaction"), {});
    await vi.waitFor(() => expect(total()).toBe(2));
    await ctx().executeTool(await tool("tour_show_step"), { selector: "#cancel", message: "Next." });
    expect(JSON.parse(await run)).toEqual({ ok: true, status: "superseded" });
  });
});
