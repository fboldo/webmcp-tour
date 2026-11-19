// The built script-tag artifact (dist/webmcp-tour.js), loaded into a page under a strict CSP
// and driven through window.webmcpTour. Needs `pnpm build` first (`pnpm check` does it).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tour } from "../src/index.js";

type Api = { tour: Tour; createTour: (o?: object) => Tour; registerAsWebMcpTool: (t: Tour | Tour[], o?: object) => Promise<{ unregister(): void }> };
type W = Window & typeof globalThis & { webmcpTour?: Api };
const frames: HTMLIFrameElement[] = [];

// `config` becomes <script type=application/json id="cfg">; pass attrs {"data-config": "cfg"} to point at it.
async function load(attrs: Record<string, string> = {}, polyfill = false, config?: string, bodyHtml?: string, asModule = false) {
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
    c.id = "cfg";
    c.textContent = config;
    doc.head.append(c);
  }
  if (bodyHtml) doc.body.insertAdjacentHTML("beforeend", bodyHtml);
  const s = doc.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  s.src = "/fx/webmcp-tour.js";
  if (asModule) s.type = "module";
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

  const CFG = { "data-config": "cfg" };
  it("ignores a same-id element that is not a JSON script block", async () => {
    const fake = `<p id="cfg">{"pages":[{"id":"x","title":"Evil","url":"https://evil.example/"}]}</p>`;
    const { win } = await load(CFG, false, undefined, fake);
    expect(win.webmcpTour!.tour.targets().pages ?? []).toEqual([]);
  });

  it("reads config from the block named by data-config, ignoring unknown and function-only options", async () => {
    const config = JSON.stringify({
      labels: { gotIt: "Entendi" },
      pages: [{ id: "billing", title: "Billing", url: "/billing" }],
      takeMeThere: true,
      navigate: "nope",
      resume: false,
    });
    const { win, doc } = await load(CFG, false, config);
    const { tour } = win.webmcpTour!;
    expect(tour.targets().pages?.map((p) => p.id)).toEqual(["billing"]);
    await tour.show({ text: "Save changes", message: "m" });
    const shadow = doc.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
    expect(shadow.textContent).toContain("Entendi");
    expect(shadow.querySelector("[part~=goto]")).not.toBeNull();
  });

  it("reads inline JSON when data-config starts with {", async () => {
    const { win } = await load({ "data-config": '{"pages":[{"id":"a","title":"A","url":"/a"}]}' });
    expect(win.webmcpTour!.tour.targets().pages?.map((p) => p.id)).toEqual(["a"]);
  });

  const pagesOf = (win: W) => win.webmcpTour!.tour.targets().pages ?? [];
  const PAGE = `{"pages":[{"id":"a","title":"A","url":"/a"}]}`;

  it("uses defaults when data-config names no element", async () => {
    const { win } = await load({ "data-config": "nope" });
    expect(win.webmcpTour).toBeDefined();
    expect(pagesOf(win)).toEqual([]);
  });

  it("uses defaults when the id is duplicated", async () => {
    const dup = `<script type="application/json" id="cfg">${PAGE}</script>`;
    const { win } = await load(CFG, false, PAGE, dup);
    expect(pagesOf(win)).toEqual([]);
  });

  it("uses defaults on invalid JSON, a non-object, or wrong shapes", async () => {
    for (const bad of ["{ nope", "[1]", "42", "null", '{"labels":{"gotIt":1}}', '{"labels":"x"}', '{"pages":{"id":"a"}}', '{"pages":[1]}']) {
      const { win } = await load(CFG, false, bad);
      expect(win.webmcpTour, bad).toBeDefined();
      expect(pagesOf(win), bad).toEqual([]);
      expect(await win.webmcpTour!.tour.show({ text: "Save changes", message: "m" }), bad).toMatchObject({ ok: true });
    }
  });

  it("survives __proto__ and constructor keys", async () => {
    const config = `{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":4}},"labels":{"__proto__":"x","gotIt":"Entendi"},"pages":[{"id":"a","title":"A","url":"/a","__proto__":{"polluted":3}}]}`;
    const { win } = await load(CFG, false, config);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((win as unknown as { Object: ObjectConstructor }).Object.prototype).not.toHaveProperty("polluted");
    expect(pagesOf(win)).toHaveLength(1);
  });

  it("without data-config the page's JSON blocks are not read", async () => {
    const { win } = await load({}, false, PAGE);
    expect(pagesOf(win)).toEqual([]);
  });

  it("a second copy does not register tools again", async () => {
    const { win, doc } = await load({}, true);
    const first = win.webmcpTour;
    await vi.waitFor(async () => expect(await toolNames(win)).toEqual(FOUR));
    const s = doc.createElement("script");
    s.src = "/fx/webmcp-tour.js";
    s.setAttribute("data-config", '{"takeMeThere":true}');
    const done = new Promise((r) => s.addEventListener("load", r, { once: true }));
    doc.head.append(s);
    await done;
    expect(win.webmcpTour).toBe(first);
    expect(await toolNames(win)).toEqual(FOUR);
  });

  it("with currentScript null (loaded as a module) there is no config and no data-* flags", async () => {
    const { win } = await load({ ...CFG, "data-no-global": "" }, false, PAGE, undefined, true);
    expect(win.webmcpTour).toBeDefined(); // data-no-global is not seen
    expect(pagesOf(win)).toEqual([]); // data-config is not seen
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

  it("is a quiet no-op without the API", async () => {
    const { win } = await load(); // no polyfill, no native API in this browser
    expect("modelContext" in win.document).toBe(false);
    expect(win.webmcpTour).toBeDefined();
  });
});
