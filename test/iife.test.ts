// The built script-tag artifact (dist/webmcp-tour.js), loaded into a page under a strict CSP
// and driven through window.webmcpTour. Needs `pnpm build` first (`pnpm check` does it).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tour } from "../src/index.js";

type Api = { tour: Tour; createTour: (o?: object) => Tour; registerAsWebMcpTool: (t: Tour | Tour[], o?: object) => Promise<{ unregister(): void }> };
type W = Window & typeof globalThis & { webmcpTour?: Api };
const frames: HTMLIFrameElement[] = [];

async function load(attrs: Record<string, string> = {}, polyfill = false, config?: string) {
  const f = document.createElement("iframe");
  Object.assign(f.style, { position: "fixed", top: "0", left: "0", width: "900px", height: "700px", border: "0", background: "#fff" });
  f.src = "/fx/iife.html";
  document.body.append(f);
  frames.push(f);
  await new Promise((r) => f.addEventListener("load", r, { once: true }));
  const win = f.contentWindow as W;
  const doc = f.contentDocument!;
  const violations: string[] = [];
  doc.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
  if (polyfill) {
    const p = doc.createElement("script");
    p.src = "/fx/polyfill.js";
    const loaded = new Promise((r) => p.addEventListener("load", r, { once: true }));
    doc.head.append(p);
    await loaded;
  }
  if (config !== undefined) {
    const c = doc.createElement("script");
    c.type = "application/json";
    c.id = "webmcp-tour-config";
    c.textContent = config;
    doc.head.append(c);
  }
  const s = doc.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  s.src = "/fx/webmcp-tour.js";
  const done = new Promise<void>((res, rej) => {
    s.onload = () => res();
    s.onerror = () => rej(new Error("dist/webmcp-tour.js did not load: run `pnpm build` first"));
  });
  doc.head.append(s);
  await done;
  return { win, doc, violations };
}

afterEach(() => {
  for (const f of frames.splice(0)) f.remove();
});

describe("dist/webmcp-tour.js", () => {
  it("exposes window.webmcpTour and drives show/dismiss", async () => {
    const { win, doc, violations } = await load();
    const { tour, createTour, registerAsWebMcpTool } = win.webmcpTour!;
    expect(typeof tour.show).toBe("function");
    expect(typeof createTour).toBe("function");
    expect(typeof registerAsWebMcpTool).toBe("function");
    expect(createTour()).not.toBe(tour);

    const events: string[] = [];
    tour.on("show", (e) => events.push(`show:${e.title}`));
    tour.on("dismiss", (e) => events.push(`dismiss:${e.reason}`));

    const byText = await tour.show({ text: "Save changes", title: "Save", message: "Click to save." });
    expect(byText).toMatchObject({ ok: true, matched: { by: "text", tag: "button", name: "save changes" } });
    const root = doc.querySelector("[data-webmcp-tour-root]")!;
    expect(root.shadowRoot!.querySelector("[part~=message]")!.textContent).toBe("Click to save.");

    expect(await tour.show({ selector: "#plan", message: "Here." })).toMatchObject({ ok: true, matched: { by: "selector" } });
    expect(await tour.show({ target: "billing-plan" })).toMatchObject({ ok: true, matched: { by: "target" } });
    expect(root.shadowRoot!.querySelector("[part~=message]")!.textContent).toBe("Opens the plan picker.");
    expect(await tour.show({ text: "Missing", message: "m" })).toMatchObject({ ok: false, error: "not_found" });

    expect(tour.dismiss()).toEqual({ ok: true, dismissed: true });
    expect(events).toEqual(["show:Save", "dismiss:superseded", "show:", "dismiss:superseded", "show:", "dismiss:hide"]);
    expect(violations).toEqual([]); // strict CSP: no inline styles or scripts needed
  });

  it("data-no-global opts out of window.webmcpTour", async () => {
    const { win } = await load({ "data-no-global": "" });
    expect(win.webmcpTour).toBeUndefined();
  });

  const toolNames = async (win: W) => (await (win.document as any).modelContext.getTools()).map((t: { name: string }) => t.name);
  const FOUR = ["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"];

  it("registers the default tour's tools on a page with the API", async () => {
    const { win } = await load({}, true);
    await vi.waitFor(async () => expect(await toolNames(win)).toEqual(FOUR));
    const mc = (win.document as any).modelContext;
    const tool = (await mc.getTools()).find((t: { name: string }) => t.name === "tour_show_step");
    expect(JSON.parse(await mc.executeTool(tool, { text: "Save changes", message: "Click." }))).toMatchObject({ ok: true });
  });

  it("data-manual keeps window.webmcpTour but registers nothing until you call registerAsWebMcpTool", async () => {
    const { win } = await load({ "data-manual": "" }, true);
    const { tour, createTour, registerAsWebMcpTool } = win.webmcpTour!;
    expect(tour).toBeDefined();
    await new Promise((r) => setTimeout(r, 300));
    expect(await toolNames(win)).toEqual([]);
    await registerAsWebMcpTool([tour, createTour({ toolPrefix: "billing" })]);
    expect(await toolNames(win)).toHaveLength(8);
  });

  it("reads the default tour's options from the JSON config block, ignoring unknown and function-only ones", async () => {
    const config = JSON.stringify({
      labels: { gotIt: "Entendi" },
      pages: [{ id: "billing", title: "Billing", url: "/billing" }],
      takeMeThere: true,
      navigate: "nope",
      resume: false,
    });
    const { win, doc } = await load({}, false, config);
    const { tour } = win.webmcpTour!;
    expect(tour.targets().pages?.map((p) => p.id)).toEqual(["billing"]);
    await tour.show({ text: "Save changes", message: "m" });
    const shadow = doc.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
    expect(shadow.textContent).toContain("Entendi");
    expect(shadow.querySelector("[part~=goto]")).not.toBeNull();
  });

  it("warns and carries on with defaults when the config is not valid JSON", async () => {
    const { win } = await load({}, false, "{ nope");
    expect(win.webmcpTour).toBeDefined();
    expect(await win.webmcpTour!.tour.show({ text: "Save changes", message: "m" })).toMatchObject({ ok: true });
  });

  it("is a quiet no-op without the API", async () => {
    const { win } = await load(); // no polyfill, no native API in this browser
    expect("modelContext" in win.document).toBe(false);
    expect(win.webmcpTour).toBeDefined();
  });
});
