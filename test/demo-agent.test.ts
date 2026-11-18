// The demo's agent loop (demo/agent.js) against a stubbed LanguageModel and WebMCP context,
// plus the demo page end to end in its scripted mode. The page test needs `pnpm build` first.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, type AgentEvent, type ModelContextLike, type ToolEntry } from "../demo/agent.js";

const tools: ToolEntry[] = ["tour_show_step", "tour_list_targets", "tour_dismiss", "tour_wait_for_interaction"].map((name) => ({
  name,
  description: `${name} description`,
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
}));

function context(results: Record<string, unknown> = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const mc: ModelContextLike = {
    getTools: async () => tools,
    // Like the W3C polyfill: resolves a JSON string.
    executeTool: async (tool, input) => {
      calls.push({ name: tool.name, input });
      return JSON.stringify(results[tool.name] ?? { ok: true });
    },
  };
  return { mc, calls };
}

interface Session {
  prompt: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}
function model(replies: string[], availability = "available") {
  const session: Session = { prompt: vi.fn(async () => replies.shift() ?? ""), destroy: vi.fn() };
  const LanguageModel = { availability: vi.fn(async () => availability), create: vi.fn(async (_o: unknown) => session) };
  return { LanguageModel, session };
}
const turn = (tool: string, args: object | string = {}, answer = "") => JSON.stringify({ tool, args: typeof args === "string" ? args : JSON.stringify(args), answer });
const types = (events: AgentEvent[]) => events.map((e) => e.type);

describe("constraint loop (Prompt API + responseConstraint)", () => {
  it("calls the tool the model picks, feeds the result back and returns the final answer", async () => {
    const { mc, calls } = context({ tour_show_step: { ok: true, matched: { by: "text" } } });
    const { LanguageModel, session } = model([turn("tour_show_step", { text: "Change plan", message: "Here" }), turn("final_answer", {}, "Click Change plan.")]);
    const events: AgentEvent[] = [];
    const out = await ask({ question: "How do I change my plan?", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });

    expect(out).toEqual({ answer: "Click Change plan.", mode: "constraint" });
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "Change plan", message: "Here" } }]);
    expect(types(events)).toEqual(["user", "status", "call", "result", "answer"]);
    expect(events.find((e) => e.type === "result")).toMatchObject({ result: { ok: true, matched: { by: "text" } } });

    const create = LanguageModel.create.mock.calls[0]![0] as { initialPrompts: { role: string; content: string }[]; tools?: unknown };
    expect(create.tools).toBeUndefined();
    expect(create.initialPrompts[0]!.content).toContain("tour_show_step description");
    const [, second] = session.prompt.mock.calls;
    expect(second![0]).toContain("Result of tour_show_step");
    const schema = (session.prompt.mock.calls[0]![1] as { responseConstraint: { properties: { tool: { enum: string[] } } } }).responseConstraint;
    expect(schema.properties.tool.enum).toEqual([...tools.map((t) => t.name), "final_answer"]);
    expect(session.destroy).toHaveBeenCalled();
  });

  it("recovers from an invalid reply, and rejects tools it was not given", async () => {
    const { mc, calls } = context();
    const { LanguageModel } = model(["not json", turn("delete_everything"), turn("final_answer", {}, "Sorry.")]);
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(calls).toEqual([]);
    expect(out.answer).toBe("Sorry.");
    expect(events.filter((e) => e.type === "error")).toHaveLength(2);
  });

  it("surfaces a failing tool as a result and keeps going", async () => {
    const { mc } = context();
    mc.executeTool = async () => {
      throw new DOMException("gone", "NotFoundError");
    };
    const { LanguageModel } = model([turn("tour_dismiss"), turn("final_answer", {}, "done")]);
    const events: AgentEvent[] = [];
    await ask({ question: "q", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === "result")).toMatchObject({ result: { ok: false, error: "NotFoundError" } });
  });

  it("stops after maxSteps when the model never finishes", async () => {
    const { mc, calls } = context();
    const { LanguageModel } = model(Array.from({ length: 10 }, () => turn("tour_list_targets")));
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: () => {}, maxSteps: 3 });
    expect(calls).toHaveLength(3);
    expect(out.answer).toMatch(/could not finish/);
  });

  it("retries a reply with invalid args JSON, naming the tool, and counts it toward the cap", async () => {
    const { mc, calls } = context();
    const { LanguageModel, session } = model([turn("tour_show_step", "{oops"), turn("tour_show_step", { text: "x" }), turn("final_answer", {}, "ok")]);
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(out.answer).toBe("ok");
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "x" } }]);
    expect(session.prompt.mock.calls[1]![0]).toMatch(/not valid JSON for tool tour_show_step.*reply again/);
  });

  it("does not give up after three bad replies; the step cap ends it", async () => {
    const { mc } = context();
    const { LanguageModel, session } = model(Array.from({ length: 20 }, () => "garbage"));
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: () => {} });
    expect(session.prompt).toHaveBeenCalledTimes(8);
    expect(out.answer).toMatch(/could not finish/);
  });

  it("treats empty args as {}", async () => {
    const { mc, calls } = context();
    const { LanguageModel } = model([turn("tour_list_targets", "   "), turn("final_answer", {}, "ok")]);
    await ask({ question: "q", LanguageModel, modelContext: mc, emit: () => {} });
    expect(calls).toEqual([{ name: "tour_list_targets", input: {} }]);
  });

  it("summarises the last highlight when the cap is hit", async () => {
    const { mc } = context({ tour_show_step: { ok: true, matched: { name: "Change plan" } } });
    const { LanguageModel } = model(Array.from({ length: 10 }, () => turn("tour_show_step", { text: "Change plan" })));
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: () => {}, maxSteps: 2 });
    expect(out.answer).toBe("I highlighted “Change plan”. Click it to continue, then ask me for the next step.");
  });

  it("the system prompt says to lead on after an interaction", async () => {
    const { mc } = context();
    const { LanguageModel } = model([turn("final_answer", {}, "ok")]);
    await ask({ question: "q", LanguageModel, modelContext: mc, emit: () => {} });
    expect((LanguageModel.create.mock.calls[0]![0] as any).initialPrompts[0].content).toContain('"interacted"');
  });

  it("aborts mid-loop without an answer", async () => {
    const { mc } = context();
    const ctl = new AbortController();
    const { LanguageModel, session } = model([]);
    session.prompt.mockImplementation(async () => {
      ctl.abort();
      return turn("tour_list_targets");
    });
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", LanguageModel, modelContext: mc, emit: (e) => events.push(e), signal: ctl.signal });
    expect(out.answer).toBe("");
    expect(events.at(-1)).toMatchObject({ type: "status", text: "Stopped." });
    expect(session.destroy).toHaveBeenCalled();
  });
});

describe("native tool use", () => {
  it("passes the page's tools to the session and records the calls it makes", async () => {
    const { mc, calls } = context();
    const { LanguageModel, session } = model(["Click Change plan."]);
    session.prompt.mockImplementation(async () => {
      const passed = (LanguageModel.create.mock.calls[0]![0] as { tools: { name: string; execute(a: object): Promise<string> }[] }).tools;
      expect(passed.map((t) => t.name)).toEqual(tools.map((t) => t.name));
      expect(JSON.parse(await passed[0]!.execute({ text: "Change plan" }))).toEqual({ ok: true });
      return "Click Change plan.";
    });
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", mode: "native", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(out).toEqual({ answer: "Click Change plan.", mode: "native" });
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "Change plan" } }]);
    expect(types(events)).toEqual(["user", "status", "call", "result", "answer"]);
  });

  it("falls back to the constraint loop when the session cannot take tools", async () => {
    const { mc } = context();
    const { LanguageModel } = model([turn("final_answer", {}, "ok")]);
    const create = LanguageModel.create.getMockImplementation()!;
    LanguageModel.create.mockImplementationOnce(async () => {
      throw new TypeError("tools unsupported");
    });
    LanguageModel.create.mockImplementation(create);
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", mode: "native", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(out).toMatchObject({ answer: "ok", mode: "constraint" });
    expect(events.some((e) => e.type === "error" && e.text.includes("native failed"))).toBe(true);
  });
});

describe("scripted fallback", () => {
  it.each([
    [undefined, "missing"],
    [model([], "unavailable").LanguageModel, "unavailable"],
    [model([], "downloadable").LanguageModel, "downloadable"],
  ])("is used, and labelled, when the model is %#", async (LanguageModel, why) => {
    const { mc, calls } = context({ tour_show_step: { ok: true } });
    const events: AgentEvent[] = [];
    const out = await ask({ question: "How do I change my plan?", LanguageModel, modelContext: mc, emit: (e) => events.push(e) });
    expect(out.mode).toBe("scripted");
    expect(calls).toEqual([{ name: "tour_show_step", input: { target: "billing-plan" } }]);
    expect(events.find((e) => e.type === "status")).toMatchObject({ text: expect.stringContaining(`(${why})`) });
    expect(out.answer).toContain("Change plan");
  });

  it("is honest when the tool cannot point at the control", async () => {
    const { mc } = context({ tour_show_step: { ok: false, error: "not_found" } });
    const out = await ask({ question: "How do I delete my account?", mode: "scripted", modelContext: mc, emit: () => {} });
    expect(out.answer).toMatch(/off-limits/);
  });

  it("passes on the reveal hint when the control is hidden", async () => {
    const { mc } = context({ tour_show_step: { ok: false, error: "not_visible", reveal: "Open Security → Advanced first." } });
    const out = await ask({ question: "two-factor?", mode: "scripted", modelContext: mc, emit: () => {} });
    expect(out.answer).toContain("Open Security → Advanced first.");
  });

  it("lists targets for a question it has no script for", async () => {
    const { mc, calls } = context({ tour_list_targets: { ok: true, targets: [{ id: "invoices" }, { id: "two-factor" }] } });
    const out = await ask({ question: "what is the weather", mode: "scripted", modelContext: mc, emit: () => {} });
    expect(calls[0]!.name).toBe("tour_list_targets");
    expect(out.answer).toContain("invoices, two-factor");
  });

  it("never touches the model when forced", async () => {
    const { mc } = context();
    const { LanguageModel } = model([]);
    await ask({ question: "invoices", mode: "scripted", LanguageModel, modelContext: mc, emit: () => {} });
    expect(LanguageModel.availability).not.toHaveBeenCalled();
    expect(LanguageModel.create).not.toHaveBeenCalled();
  });

  it("reports when no tools are registered", async () => {
    const events: AgentEvent[] = [];
    const out = await ask({ question: "q", modelContext: { getTools: async () => [], executeTool: async () => null }, emit: (e) => events.push(e) });
    expect(out.mode).toBe("none");
    expect(events[0]).toMatchObject({ type: "error" });
  }, 10_000);
});

describe("demo page (scripted mode, end to end)", () => {
  const frames: HTMLIFrameElement[] = [];
  afterEach(() => frames.splice(0).forEach((f) => f.remove()));

  async function open(query: string) {
    const f = document.createElement("iframe");
    Object.assign(f.style, { position: "fixed", top: "0", left: "0", width: "1280px", height: "900px", border: "0", background: "#fff" });
    f.src = `/demo/index.html${query}`;
    document.body.append(f);
    frames.push(f);
    await new Promise((r) => f.addEventListener("load", r, { once: true }));
    return f.contentDocument!;
  }
  const answered = (doc: Document) => vi.waitFor(() => expect(doc.querySelector("#transcript li.answer")).not.toBeNull(), { timeout: 8000 });

  it("answers a sample question by driving the real tools, and the overlay shows", async () => {
    const doc = await open("?agent=scripted");
    expect(doc.getElementById("assistant-mode")!.textContent).toContain("Scripted demo agent");
    const form = doc.getElementById("ask") as HTMLFormElement;
    (form.elements.namedItem("q") as HTMLInputElement).value = "How do I change my plan?";
    form.requestSubmit();
    await answered(doc);

    const lines = [...doc.querySelectorAll("#transcript li")].map((li) => li.textContent);
    expect(lines.some((l) => l!.startsWith("→ tour_show_step("))).toBe(true);
    expect(lines.some((l) => l!.startsWith("← tour_show_step:") && l!.includes('"ok":true'))).toBe(true);
    expect(doc.querySelector("[data-webmcp-tour-root]")).not.toBeNull();
    expect(doc.querySelector("[data-webmcp-tour-root]")!.shadowRoot!.querySelector("[part~=message]")!.textContent).toContain("plan picker");
  }, 15_000);

  it("keeps the excluded control off-limits", async () => {
    const doc = await open("?agent=scripted");
    const form = doc.getElementById("ask") as HTMLFormElement;
    (form.elements.namedItem("q") as HTMLInputElement).value = "How do I delete my account?";
    form.requestSubmit();
    await answered(doc);
    expect(doc.querySelector("#transcript li.answer")!.textContent).toContain("off-limits");
    expect(doc.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector("[part~=message]")).toBeFalsy();
  }, 15_000);

  const ask = (doc: Document, q: string) => {
    doc.querySelectorAll("#transcript li.answer").forEach((li) => li.remove());
    const form = doc.getElementById("ask") as HTMLFormElement;
    (form.elements.namedItem("q") as HTMLInputElement).value = q;
    form.requestSubmit();
    return answered(doc);
  };
  const card = (doc: Document) => doc.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
  const view = (doc: Document) => [...doc.querySelectorAll<HTMLElement>("[data-view]")].filter((s) => !s.hidden).map((s) => s.id);

  it("two-factor from Billing: a suggestion card first, the highlight after Go", async () => {
    const doc = await open("?agent=scripted");
    const path = doc.location.pathname;
    expect(view(doc)).toEqual(["billing"]);

    await ask(doc, "How do I set up two-factor?");
    const lines = [...doc.querySelectorAll("#transcript li")].map((li) => li.textContent!);
    expect(lines.some((l) => l.startsWith("← tour_show_step:") && l.includes('"error":"other_page"'))).toBe(true);
    expect(doc.querySelector("#transcript li.answer")!.textContent).toContain("Security");
    // The card asks; nothing has moved.
    expect(card(doc).querySelector("[part~=message]")!.textContent).toBe("Your assistant suggests going to Security");
    expect(card(doc).querySelector("[part~=spotlight]")?.matches(":popover-open")).toBeFalsy();
    expect(doc.location.pathname).toBe(path);
    expect(view(doc)).toEqual(["billing"]);

    card(doc).querySelector<HTMLElement>("[part~=go]")!.click();
    expect(doc.location.pathname).toBe("/demo/security");
    expect(view(doc)).toEqual(["security"]);

    // The control sits under Security → Advanced: the reveal hint says so until the user opens it.
    await ask(doc, "How do I set up two-factor?");
    expect(doc.querySelector("#transcript li.answer")!.textContent).toContain("Advanced");
    doc.querySelector("details")!.open = true;
    await ask(doc, "How do I set up two-factor?");
    expect(card(doc).querySelector("[part~=message]")!.textContent).toContain("two-factor setup");
    expect(card(doc).querySelector<HTMLElement>("[part~=spotlight]")!.matches(":popover-open")).toBe(true);
    expect(card(doc).querySelector<HTMLElement>("[part~=gotit]")!.hidden).toBe(false);
  }, 20_000);

  it("Not now leaves the page where it is", async () => {
    const doc = await open("?agent=scripted");
    await ask(doc, "How do I set up two-factor?");
    card(doc).querySelector<HTMLElement>("[part~=notnow]")!.click();
    expect(view(doc)).toEqual(["billing"]);
    expect(card(doc).querySelector<HTMLElement>("[part~=popover]")!.matches(":popover-open")).toBe(false);
  }, 20_000);

  it("the nav links route client-side and declare the pages to the tour", async () => {
    const doc = await open("?agent=scripted");
    doc.querySelector<HTMLAnchorElement>('nav a[data-page="team"]')!.click();
    expect(doc.location.pathname).toBe("/demo/team");
    expect(view(doc)).toEqual(["team"]);
    const tour = (doc.defaultView as unknown as { webmcpTour: { page(): { id: string } | undefined } }).webmcpTour;
    expect(tour.page()?.id).toBe("team");
  }, 20_000);
});
