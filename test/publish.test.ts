// Page URL safety, atomic registration and the generated version.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json";
import { VERSION, createTour, registerAsWebMcpTool } from "../src/index.js";
import type { Registration, Tour } from "../src/index.js";

installWebMCP();

const ctx = () => (document as unknown as { modelContext: { getTools(): Promise<{ name: string }[]> } }).modelContext;
const names = async () => (await ctx().getTools()).map((t) => t.name).sort();

let tour: Tour | undefined;
let reg: Registration | undefined;
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  reg?.unregister();
  reg = undefined;
  tour?.destroy();
  tour = undefined;
  vi.restoreAllMocks();
});

describe("page URLs", () => {
  const page = (url: string, more: object = {}) => ({ id: "p", title: "P", url, ...more });

  it.each(["javascript:window.__pwned=1", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "blob:https://example.com/x", "ftp://example.com/x"])("refuses %s", (url) => {
    tour = createTour({ navigate: () => {} });
    expect(() => tour!.definePage(page(url))).toThrow(/http/);
    expect(() => tour!.definePage(page(url, { allowCrossOrigin: true }))).toThrow(/http/);
    expect(() => createTour({ pages: [page(url)] })).toThrow(/http/);
  });

  it("accepts relative and same-origin URLs", () => {
    tour = createTour();
    for (const url of ["/billing", "billing?x=1#y", location.origin + "/billing"]) expect(() => tour!.definePage(page(url))).not.toThrow();
  });

  it("refuses another origin unless allowCrossOrigin is set or a custom navigate is passed", () => {
    tour = createTour();
    expect(() => tour!.definePage(page("https://evil.example/x"))).toThrow(/origin/);
    expect(() => tour!.definePage(page("//evil.example/x"))).toThrow(/origin/);
    expect(() => tour!.definePage(page("https://other.example/x", { allowCrossOrigin: true }))).not.toThrow();
    const custom = createTour({ navigate: () => {} });
    expect(() => custom.definePage(page("https://other.example/x"))).not.toThrow();
    custom.destroy();
  });
});

describe("registration is atomic", () => {
  it("rejects and leaves nothing behind when one tool cannot register", async () => {
    tour = createTour();
    reg = await registerAsWebMcpTool(tour);
    expect(await names()).toHaveLength(4);
    // Same show_step name as the registered tour, three fresh names.
    const clash = createTour({ names: { dismiss: "other_dismiss", listTargets: "other_list", waitForInteraction: "other_wait" } });
    await expect(registerAsWebMcpTool(clash)).rejects.toThrow();
    expect(await names()).toEqual(["tour_dismiss", "tour_list_targets", "tour_show_step", "tour_wait_for_interaction"]);
    clash.destroy();
  });

  it("rejects (not throws) on duplicate names inside one call", async () => {
    tour = createTour();
    const p = registerAsWebMcpTool([tour, tour]);
    expect(p).toBeInstanceOf(Promise);
    await expect(p).rejects.toThrow(/more than one tool/);
  });
});

describe("VERSION", () => {
  it("comes from package.json", () => {
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).not.toBe("0.0.0");
  });
});
