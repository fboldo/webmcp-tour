// Got it, "Take me there" opt-in, translations, pages, the page suggestion card and the tools around them.
import { installWebMCP } from "@w3c/webmcp-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createTour, registerAsWebMcpTool } from "../src/index.js";
import type { Registration, Tour, TourOptions, WaitResult } from "../src/index.js";

installWebMCP(); // a no-op where the browser has the API natively

const slots = globalThis as Record<symbol, unknown>;
const PAGE = `
  <h2>Account</h2>
  <button id="plan" data-tour-id="billing-plan" data-tour-description="Opens the plan picker.">Change plan</button>
  <button id="save">Save changes</button>
  <button id="tfa" data-tour-id="two-factor" data-tour-page="security" data-tour-label="Set up two-factor" data-tour-description="Starts two-factor setup.">Set up two-factor</button>
`;
const PAGES = [
  { id: "billing", url: "/billing", title: "Billing", description: "Plan and invoices." },
  { id: "security", url: "/security", title: "Security" },
];

let tour: Tour;
let navigate: Mock<(url: string) => void>;
const root = () => document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
const q = (p: string) => root().querySelector<HTMLElement>(`[part~=${p}]`)!;
const open = (p: string) => !!root().querySelector<HTMLElement>(`[part~=${p}]`)?.matches(":popover-open");
const visible = (p: string) => !q(p).hidden;
const fresh = (options: TourOptions = {}) => {
  tour.destroy();
  tour = createTour({ navigate, ...options });
};
const settled = (p: Promise<unknown>, ms = 100) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);

beforeEach(() => {
  history.replaceState(null, "", "/billing");
  document.body.innerHTML = PAGE;
  navigate = vi.fn<(url: string) => void>();
  tour = createTour({ navigate, pages: PAGES });
});
afterEach(() => {
  tour?.destroy();
  document.body.innerHTML = "";
});

describe("Got it", () => {
  it("is the default action; Take me there is not on the card", async () => {
    await tour.show({ target: "billing-plan" });
    expect(q("gotit").textContent).toBe("Got it");
    expect(visible("gotit")).toBe(true);
    expect(visible("goto")).toBe(false);
    expect(visible("go")).toBe(false);
    expect(visible("notnow")).toBe(false);
  });

  it("dismisses the step and reports the reason acknowledged", async () => {
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    await tour.show({ target: "billing-plan" });
    q("gotit").click();
    expect(open("popover")).toBe(false);
    expect(reasons).toEqual(["acknowledged"]);
  });

  it("resolves a pending wait with acknowledged", async () => {
    await tour.show({ target: "billing-plan" });
    const wait = tour.waitForInteraction();
    expect(await settled(wait)).toBe(false);
    q("gotit").click();
    expect(await wait).toEqual({ ok: true, status: "acknowledged" });
  });

  it("the wait tool resolves acknowledged and says what that means", async () => {
    const [, , , wait] = tour.tools();
    expect(wait!.description).toContain("acknowledged");
    await tour.show({ target: "billing-plan" });
    const p = wait!.execute({});
    q("gotit").click();
    expect(await p).toEqual({ ok: true, status: "acknowledged" });
  });

  it("closing with × does not acknowledge", async () => {
    await tour.show({ target: "billing-plan" });
    const wait = tour.waitForInteraction({}, { timeoutMs: 150 });
    q("close").click();
    expect(await wait).toEqual({ ok: true, status: "timeout" });
  });
});

describe("takeMeThere", () => {
  it("is opt-in and keeps its behaviour: scroll, focus", async () => {
    fresh({ pages: PAGES, takeMeThere: true });
    await tour.show({ target: "billing-plan" });
    expect(visible("gotit")).toBe(true);
    expect(q("goto").textContent).toBe("Take me there");
    expect(visible("goto")).toBe(true);
    q("goto").click();
    expect(document.activeElement).toBe(document.getElementById("plan"));
    expect(open("popover")).toBe(true); // it points, it does not dismiss
  });
});

describe("labels", () => {
  const labels = { gotIt: "Entendi", takeMeThere: "Leva-me lá", close: "Fechar", attribution: "Do teu assistente", goToPage: "Ir para {page}", notNow: "Agora não", otherPage: "O assistente sugere ir para {page}" };

  it("replace the card's text and its aria labels", async () => {
    fresh({ pages: PAGES, takeMeThere: true, labels });
    await tour.show({ target: "billing-plan" });
    expect(q("gotit").textContent).toBe("Entendi");
    expect(q("goto").textContent).toBe("Leva-me lá");
    expect(q("attribution").textContent).toBe("Do teu assistente");
    expect(q("close").getAttribute("aria-label")).toBe("Fechar");
    expect(q("popover").getAttribute("aria-label")).toBe("Do teu assistente");
  });

  it("translate the page suggestion with {page} filled in", async () => {
    fresh({ pages: PAGES, labels });
    await tour.show({ target: "two-factor" });
    expect(q("message").textContent).toBe("O assistente sugere ir para Security");
    expect(q("go").textContent).toBe("Ir para Security");
    expect(q("notnow").textContent).toBe("Agora não");
  });

  it("default to English and merge partially; the old attribution option still works", async () => {
    fresh({ pages: PAGES, labels: { gotIt: "OK" }, attribution: "Acme" });
    await tour.show({ target: "billing-plan" });
    expect(q("gotit").textContent).toBe("OK");
    expect(q("close").getAttribute("aria-label")).toBe("Dismiss");
    expect(q("attribution").textContent).toBe("Acme");
    fresh({ labels: { attribution: "New" }, attribution: "Old" });
    await tour.show({ target: "billing-plan" });
    expect(q("attribution").textContent).toBe("New");
  });

  it("are plain text: markup in a label is not parsed", async () => {
    fresh({ labels: { gotIt: "<b>x</b>" } });
    await tour.show({ target: "billing-plan" });
    expect(q("gotit").textContent).toBe("<b>x</b>");
    expect(q("gotit").children.length).toBe(0);
  });
});

describe("pages", () => {
  const at = (path: string) => history.replaceState(null, "", path);

  it("the default match compares the url path with location.pathname", () => {
    expect(tour.page()).toEqual({ id: "billing", title: "Billing" });
    at("/security/");
    expect(tour.page()).toEqual({ id: "security", title: "Security" });
    at("/elsewhere");
    expect(tour.page()).toBeUndefined();
  });

  it("match accepts a string prefix, a RegExp or a function", () => {
    fresh({
      pages: [
        { id: "s", url: "/settings", title: "S", match: "/settings" },
        { id: "r", url: "/r/1", title: "R", match: /^\/r\/\d+$/ },
        { id: "f", url: "/f", title: "F", match: (l) => l.search === "?tab=f" },
      ],
    });
    at("/settings/profile");
    expect(tour.page()?.id).toBe("s");
    at("/r/42");
    expect(tour.page()?.id).toBe("r");
    at("/r/x");
    expect(tour.page()).toBeUndefined();
    at("/anything?tab=f");
    expect(tour.page()?.id).toBe("f");
  });

  it("a global RegExp is not stateful, and a throwing matcher does not match", () => {
    fresh({ pages: [{ id: "g", url: "/g", title: "G", match: /g/g }, { id: "t", url: "/t", title: "T", match: () => { throw new Error("x"); } }] });
    at("/g");
    expect(tour.page()?.id).toBe("g");
    expect(tour.page()?.id).toBe("g");
    at("/t");
    expect(tour.page()).toBeUndefined();
  });

  it("definePage registers later and returns an undo; bad input throws", () => {
    at("/late");
    expect(tour.page()).toBeUndefined();
    const off = tour.definePage({ id: "late", url: "/late", title: "Late" });
    expect(tour.page()?.id).toBe("late");
    off();
    expect(tour.page()).toBeUndefined();
    expect(() => tour.definePage({ id: "", url: "/x", title: "X" })).toThrow(TypeError);
    expect(() => tour.definePage({ id: "x", url: "/x", title: "X", match: 5 as never })).toThrow(TypeError);
  });

  it("defineTarget accepts a page alone, and still refuses an empty definition", () => {
    expect(() => tour.defineTarget({ id: "a", page: "security" })).not.toThrow();
    expect(() => tour.defineTarget({ id: "b" })).toThrow(TypeError);
    expect(() => tour.defineTarget({ id: "c", page: "security", selector: "#x", element: document.body })).toThrow(TypeError);
  });
});

describe("a target on another page", () => {
  it("shows the suggestion card, no spotlight, and returns other_page", async () => {
    const r = await tour.show({ target: "two-factor" });
    expect(r).toMatchObject({ ok: false, error: "other_page", page: { id: "security", title: "Security" } });
    expect(open("popover")).toBe(true);
    expect(open("spotlight")).toBe(false);
    expect(q("message").textContent).toBe("Your assistant suggests going to Security");
    expect(q("go").textContent).toBe("Go to Security");
    expect(q("notnow").textContent).toBe("Not now");
    expect(visible("go") && visible("notnow") && !visible("gotit") && !visible("goto")).toBe(true);
  });

  it("works for a target declared in code with only a page", async () => {
    tour.defineTarget({ id: "members", page: "security", label: "Members", description: "Who has access." });
    expect(await tour.show({ target: "members" })).toMatchObject({ ok: false, error: "other_page", page: { id: "security" } });
  });

  it("a page that is not registered is just a missing target", async () => {
    tour.defineTarget({ id: "ghost", page: "nowhere", label: "Ghost" });
    expect(await tour.show({ target: "ghost" })).toMatchObject({ ok: false, error: "target_not_found" });
    expect(tour.targets().targets.map((t) => t.id)).not.toContain("ghost");
  });

  it("on its own page it is an ordinary target", async () => {
    history.replaceState(null, "", "/security");
    expect(await tour.show({ target: "two-factor" })).toMatchObject({ ok: true, matched: { by: "target" } });
    expect(open("spotlight")).toBe(true);
    expect(visible("go")).toBe(false);
  });

  it("is an error envelope with isError through the tool", async () => {
    const [show] = tour.tools();
    expect(await show!.execute({ target: "two-factor" })).toMatchObject({ ok: false, error: "other_page", isError: true, page: { id: "security", title: "Security" } });
  });

  it("a modal dialog blocks the suggestion like any step", async () => {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="d">x</dialog>`);
    (document.getElementById("d") as HTMLDialogElement).showModal();
    expect(await tour.show({ target: "two-factor" })).toMatchObject({ ok: false, error: "obscured" });
  });
});

describe("the page locator", () => {
  it("suggests a page: { ok: true, suggested }", async () => {
    expect(await tour.show({ page: "security" })).toEqual({ ok: true, suggested: { id: "security", title: "Security" } });
    expect(open("popover")).toBe(true);
    expect(q("go").textContent).toBe("Go to Security");
  });

  it("rejects an unknown page, the current page, and a mix of locators", async () => {
    expect(await tour.show({ page: "nope" })).toMatchObject({ ok: false, error: "page_not_found", available: ["billing", "security"] });
    expect(await tour.show({ page: "billing" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await tour.show({ page: "security", text: "Save changes", message: "m" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await tour.show({ page: "" })).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("the tool notes that nothing navigates without a click", async () => {
    const [show] = tour.tools();
    const r = await show!.execute({ page: "security" });
    expect(r).toMatchObject({ ok: true, suggested: { id: "security" } });
    expect(String(r["note"])).toContain("Nothing navigates unless");
  });
});

describe("Go, Not now and navigation", () => {
  it("never navigates from the call itself", async () => {
    await tour.show({ target: "two-factor" });
    await tour.show({ page: "security" });
    const [show, list, dismiss, wait] = tour.tools();
    await show!.execute({ page: "security" });
    await show!.execute({ target: "two-factor" });
    await list!.execute({});
    await wait!.execute({}, { signal: AbortSignal.abort() });
    await dismiss!.execute({});
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Go calls navigate(url) once, resolves the wait navigating, and dismisses", async () => {
    const reasons: string[] = [];
    tour.on("dismiss", (e) => reasons.push(e.reason));
    await tour.show({ target: "two-factor" });
    const wait = tour.waitForInteraction();
    expect(await settled(wait)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    q("go").click();
    expect(await wait).toEqual({ ok: true, status: "navigating" });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0]![0]).toMatch(/^\/security\?webmcp-tour=[0-9a-f]{24}$/);
    expect(open("popover")).toBe(false);
    expect(reasons).toEqual(["navigating"]);
  });

  it("Not now dismisses without navigating, and the wait resolves dismissed", async () => {
    await tour.show({ page: "security" });
    const wait = tour.waitForInteraction();
    q("notnow").click();
    expect(await wait).toEqual({ ok: true, status: "dismissed" });
    expect(navigate).not.toHaveBeenCalled();
    expect(open("popover")).toBe(false);
  });

  it("× and Escape on the suggestion are also a refusal", async () => {
    await tour.show({ page: "security" });
    let wait = tour.waitForInteraction();
    q("close").click();
    expect(await wait).toEqual({ ok: true, status: "dismissed" });
    await tour.show({ page: "security" });
    wait = tour.waitForInteraction();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await wait).toEqual({ ok: true, status: "dismissed" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a new step supersedes the suggestion and Go can no longer be pressed", async () => {
    await tour.show({ page: "security" });
    const wait = tour.waitForInteraction();
    await tour.show({ target: "billing-plan" });
    expect(await wait).toEqual({ ok: true, status: "superseded" });
    expect(visible("go")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a stray wait with no suggestion and no step is still no_step", async () => {
    expect(await tour.waitForInteraction()).toMatchObject({ ok: false, error: "no_step" });
  });

  it("an app router that throws does not break the tour", async () => {
    navigate.mockImplementation(() => {
      throw new Error("boom");
    });
    await tour.show({ page: "security" });
    const wait: Promise<WaitResult> = tour.waitForInteraction();
    q("go").click();
    expect(await wait).toEqual({ ok: true, status: "navigating" });
  });
});

describe("tour_list_targets with pages", () => {
  it("reports the current page and off-page targets with their page", () => {
    tour.defineTarget({ id: "members", page: "security", label: "Members", description: "Who has access." });
    const { targets, total, page, pages } = tour.targets();
    expect(page).toEqual({ id: "billing", title: "Billing" });
    expect(pages).toEqual([{ id: "security", title: "Security" }]);
    expect(targets.find((t) => t.id === "billing-plan")).toMatchObject({ visible: true });
    expect(targets.find((t) => t.id === "billing-plan")).not.toHaveProperty("onThisPage");
    expect(targets.find((t) => t.id === "two-factor")).toEqual({ id: "two-factor", label: "Set up two-factor", description: "Starts two-factor setup.", visible: false, page: { id: "security", title: "Security" }, onThisPage: false });
    expect(targets.find((t) => t.id === "members")).toMatchObject({ label: "Members", onThisPage: false, page: { id: "security" } });
    expect(total).toBe(3);
  });

  it("the tool result carries page, pages and targets; a target is on this page once the page matches", async () => {
    const [, list] = tour.tools();
    const r = await list!.execute({});
    expect(r).toMatchObject({ ok: true, page: { id: "billing" }, pages: [{ id: "security" }], count: 2 });
    history.replaceState(null, "", "/security");
    const r2 = await list!.execute({});
    expect(r2).toMatchObject({ page: { id: "security" }, pages: [{ id: "billing", description: "Plan and invoices." }] });
    const two = (r2["targets"] as { id: string; onThisPage?: boolean }[]).find((t) => t.id === "two-factor")!;
    expect(two.onThisPage).toBeUndefined();
  });
});

describe("registration with pages", () => {
  type Registered = { name: string };
  type Ctx = { getTools(): Promise<Registered[]>; executeTool(tool: Registered, input?: object): Promise<string> };
  const ctx = () => (document as unknown as { modelContext: Ctx }).modelContext;
  const names = async () => (await ctx().getTools()).map((t) => t.name).sort();
  let reg: Registration | undefined;
  afterEach(async () => {
    reg?.unregister();
    reg = undefined;
    tour?.destroy();
    delete slots[Symbol.for("webmcp-tour.informed")];
    await vi.waitFor(async () => expect(await names()).toEqual([]));
  });

  it("tour_list_targets is registered when there are only pages, with no declared target", async () => {
    tour.destroy();
    document.body.innerHTML = "<h1>Hi</h1>";
    tour = createTour({ pages: PAGES, navigate });
    reg = await registerAsWebMcpTool(tour);
    expect(await names()).toContain("tour_list_targets");
    const list = (await ctx().getTools()).find((t) => t.name === "tour_list_targets")!;
    expect(JSON.parse(await ctx().executeTool(list, {}))).toMatchObject({ ok: true, count: 0, pages: [{ id: "security" }] });
  });

  it("is registered with no pages at all, and sees pages defined later", async () => {
    tour.destroy();
    document.body.innerHTML = "<h1>Hi</h1>";
    history.replaceState(null, "", "/billing");
    tour = createTour({ navigate });
    reg = await registerAsWebMcpTool(tour);
    expect(await names()).toContain("tour_list_targets");
    const list = async () => JSON.parse(await ctx().executeTool((await ctx().getTools()).find((t) => t.name === "tour_list_targets")!, {}));
    expect((await list()).pages).toBeUndefined();
    tour.definePage({ id: "security", url: "/security", title: "Security" });
    expect((await list()).pages).toMatchObject([{ id: "security" }]);
  });
});
