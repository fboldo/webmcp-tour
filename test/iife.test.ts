// The built script-tag artifact (dist/webmcp-tour.js), loaded into a page under a strict CSP
// and driven through window.webmcpTour. Needs `pnpm build` first (`pnpm check` does it).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tour } from "../src/index.js";

type W = Window & typeof globalThis & { webmcpTour?: Tour; [k: symbol]: unknown };
const frames: HTMLIFrameElement[] = [];

async function load(attrs: Record<string, string> = {}, polyfill = false) {
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
    const tour = win.webmcpTour!;
    expect(typeof tour.show).toBe("function");
    expect(win[Symbol.for("webmcp-tour")]).toBe(tour);

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

  it("data-no-global opts out of window.webmcpTour but keeps the singleton", async () => {
    const { win } = await load({ "data-no-global": "" });
    expect(win.webmcpTour).toBeUndefined();
    const tour = win[Symbol.for("webmcp-tour")] as Tour;
    expect(await tour.show({ text: "Save changes", message: "m" })).toMatchObject({ ok: true });
  });

  const toolNames = async (win: W) => (await (win.document as any).modelContext.getTools()).map((t: { name: string }) => t.name);

  it("registers the tools on a page with the API, once even if the script loads twice", async () => {
    const { win, doc } = await load({}, true);
    // Registration is async and the fixture declares targets, so list_targets follows.
    await vi.waitFor(async () => expect(await toolNames(win)).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step"]));
    const warns: unknown[] = [];
    win.console.warn = (...a: unknown[]) => void warns.push(a);
    const again = doc.createElement("script");
    again.src = "/fx/webmcp-tour.js";
    await new Promise((r) => { again.onload = r; doc.head.append(again); });
    await new Promise((r) => setTimeout(r, 300));
    expect(warns).toEqual([]); // a second registration attempt would have warned about the duplicate names
    expect(await toolNames(win)).toHaveLength(3);
    const mc = (win.document as any).modelContext;
    const tool = (await mc.getTools()).find((t: { name: string }) => t.name === "tour_show_step");
    expect(JSON.parse(await mc.executeTool(tool, { text: "Save changes", message: "Click." }))).toMatchObject({ ok: true });
  });

  it("data-no-auto keeps window.webmcpTour but registers nothing", async () => {
    const { win } = await load({ "data-no-auto": "" }, true);
    expect(win.webmcpTour).toBeDefined();
    await new Promise((r) => setTimeout(r, 300));
    expect(await toolNames(win)).toEqual([]);
  });

  it("is a quiet no-op without the API", async () => {
    const { win } = await load(); // no polyfill, no native API in this browser
    expect("modelContext" in win.document).toBe(false);
    expect(win.webmcpTour).toBeDefined();
  });
});
