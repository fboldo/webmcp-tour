// tour_list_targets' page outline: what is visible, what is never reported, caps, scope.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour, registerAutoTools } from "../src/index.js";
import type { AutoHandle, Tour, TourOptions } from "../src/index.js";

installWebMCP();

type Reg = { name: string };
type Ctx = { getTools(): Promise<Reg[]>; executeTool(tool: Reg, input?: object): Promise<string> };
const ctx = () => (document as unknown as { modelContext: Ctx }).modelContext;
async function list(): Promise<Record<string, any>> {
  const tool = (await ctx().getTools()).find((t) => t.name === "tour_list_targets")!;
  return JSON.parse(await ctx().executeTool(tool, {}));
}

const slots = globalThis as Record<symbol, unknown>;
let auto: AutoHandle | undefined;
let tour: Tour;
async function start(html: string, options: TourOptions = {}) {
  document.body.innerHTML = html;
  tour = createTour(options);
  auto = registerAutoTools();
  await auto.ready;
}
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(async () => {
  auto?.stop();
  auto = undefined;
  (slots[Symbol.for("webmcp-tour")] as Tour | undefined)?.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  await vi.waitFor(async () => expect(await ctx().getTools()).toEqual([]));
});

const APP = `
  <header><nav aria-label="Main"><a href="/secret-url?token=sk-live-123">Dashboard</a><a href="/billing">Billing</a></nav></header>
  <main>
    <h1>Settings</h1>
    <section aria-label="Profile">
      <label>Email <input id="email" type="email" value="hunter2@example.com" data-api-key="sk-attr-999" placeholder="you@example.com"></label>
      <label for="pw">Password</label><input id="pw" type="password" value="p4ssw0rd-secret">
      <select aria-label="Language" title="tooltip-secret"><option value="x-opt-secret">Portuguese</option></select>
      <div role="tablist"><button role="tab">General</button><div role="menuitem" tabindex="0">Export</div></div>
      <button type="submit" id="save">Save changes</button>
    </section>
    <h2>Danger</h2>
    <button>Delete account</button>
  </main>
`;

describe("outline", () => {
  it("lists visible headings and controls with role, name and context", async () => {
    await start(APP);
    const { outline } = await list();
    expect(outline.headings).toEqual(["Settings", "Danger"]);
    expect(outline.truncated).toBeUndefined();
    expect(outline.controls).toContainEqual({ role: "link", name: "Billing", context: "Main" });
    expect(outline.controls).toContainEqual({ role: "textbox", name: "Email", context: "Profile" });
    expect(outline.controls).toContainEqual({ role: "combobox", name: "Language", context: "Profile" });
    expect(outline.controls).toContainEqual({ role: "tab", name: "General", context: "Profile" });
    expect(outline.controls).toContainEqual({ role: "menuitem", name: "Export", context: "Profile" });
    expect(outline.controls).toContainEqual({ role: "button", name: "Delete account", context: "Danger" });
  });

  it("never reports values, attributes or URLs", async () => {
    await start(APP);
    const json = JSON.stringify(await list());
    for (const secret of ["hunter2", "p4ssw0rd", "sk-attr", "sk-live", "secret-url", "x-opt-secret", "tooltip-secret", "/billing", "href"]) expect(json).not.toContain(secret);
  });

  it("omits excluded, hidden, aria-hidden, inert and overlay content", async () => {
    await start(`
      <h1>Page</h1>
      <h2 hidden>Hidden heading</h2>
      <button>Shown</button>
      <button data-tour-exclude>Excluded one</button>
      <div data-tour-exclude><button>Inside excluded</button></div>
      <button style="display:none">Display none</button>
      <button style="visibility:hidden">Visibility hidden</button>
      <div aria-hidden="true"><button>Aria hidden</button></div>
      <div inert><button>Inert</button></div>
      <button class="mine">Custom excluded</button>`, { exclude: ".mine" });
    tour.defineTarget({ id: "x", selector: "button" });
    await tour.show({ text: "Shown", message: "here" });
    const { outline } = await list();
    expect(outline.controls.map((c: any) => c.name)).toEqual(["Shown"]);
    expect(outline.headings).toEqual(["Page"]);
    expect(JSON.stringify(outline)).not.toMatch(/Got it|Dismiss|Close/);
  });

  it("honours scope", async () => {
    document.body.innerHTML = `<button>Outside</button><div id="s"><h2>In scope</h2><button>Inside</button></div>`;
    tour = createTour({ scope: document.getElementById("s")! });
    auto = registerAutoTools();
    await auto.ready;
    const { outline } = await list();
    expect(outline).toEqual({ headings: ["In scope"], controls: [{ role: "button", name: "Inside", context: "In scope" }] });
  });

  it("caps controls (60), headings (30) and name length (60), and flags truncation", async () => {
    const many = Array.from({ length: 70 }, (_, i) => `<button>Button ${i}</button>`).join("");
    const heads = Array.from({ length: 35 }, (_, i) => `<h3>Heading ${i}</h3>`).join("");
    await start(`${heads}${many}<button>${"long ".repeat(30)}</button>`);
    const { outline } = await list();
    expect(outline.controls).toHaveLength(60);
    expect(outline.headings).toHaveLength(30);
    expect(outline.truncated).toBe(true);
    await start(`<button>${"long ".repeat(30)}</button>`);
    const second = (await list()).outline;
    expect(second.controls[0].name.length).toBeLessThanOrEqual(60);
  });

  it("keeps declared targets as they were and reports the current page", async () => {
    await start(`<h1>Billing</h1><button data-tour-id="plan" data-tour-description="Pick a plan">Change plan</button>`, {
      pages: [{ id: "billing", url: location.pathname, title: "Billing" }, { id: "team", url: "/team", title: "Team" }],
    });
    const r = await list();
    expect(r.page).toMatchObject({ id: "billing", title: "Billing" });
    expect(r.targets).toEqual([{ id: "plan", label: "Change plan", description: "Pick a plan", visible: true }]);
    expect(r.outline.controls).toEqual([{ role: "button", name: "Change plan", context: "Billing" }]);
  });
});
