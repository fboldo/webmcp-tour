// The demo's OpenRouter mode (demo/openrouter.js) with fetch stubbed: no real network, no real key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, type AgentEvent, type ModelContextLike, type ToolEntry } from "../demo/agent.js";
import { createKeyStore, DEFAULT_MODEL, ENDPOINT, MODELS, STORAGE_KEY } from "../demo/openrouter.js";

const KEY = "sk-or-v1-TESTKEY-0123456789";
const tools: ToolEntry[] = ["tour_show_step", "tour_list_targets", "tour_dismiss", "tour_wait_for_interaction"].map((name) => ({
  name,
  description: `${name} description`,
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
}));

function context() {
  const calls: { name: string; input: unknown }[] = [];
  const mc: ModelContextLike = {
    getTools: async () => tools,
    executeTool: async (tool, input) => {
      calls.push({ name: tool.name, input });
      return JSON.stringify({ ok: true });
    },
  };
  return { mc, calls };
}

type Reply = { status?: number; body: unknown };
const completion = (message: object): Reply => ({ body: { choices: [{ message: { role: "assistant", ...message } }] } });
const toolCall = (name: string, args: object | string, id = "call_1") => ({ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const text = (content: string) => completion({ content });
const failure = (status: number, message = "nope"): Reply => ({ status, body: { error: { code: status, message } } });

function stub(replies: Reply[]) {
  const requests: { url: string; init: RequestInit; body: any }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, init, body: JSON.parse(String(init.body)) });
    const r = replies.shift() ?? failure(500, "out of replies");
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests, mock: fetch };
}

async function run(replies: Reply[], extra: Partial<Parameters<typeof ask>[0]> = {}) {
  const { mc, calls } = context();
  const s = stub(replies);
  const events: AgentEvent[] = [];
  const out = await ask({ question: "How do I change my plan?", mode: "openrouter", modelContext: mc, emit: (e) => events.push(e), fetch: s.fetch, openrouter: { apiKey: KEY }, ...extra });
  return { out, events, calls, ...s };
}

describe("tool-calling loop", () => {
  it("maps the page's tools, runs the tool_calls and returns the final answer", async () => {
    const { out, events, calls, requests } = await run([completion({ content: null, tool_calls: [toolCall("tour_show_step", { text: "Change plan" })] }), text("Click Change plan.")]);
    expect(out).toEqual({ answer: "Click Change plan.", mode: "openrouter" });
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "Change plan" } }]);
    expect(events.map((e) => e.type)).toEqual(["user", "status", "call", "result", "answer"]);

    const [first, second] = requests;
    expect(first!.url).toBe(ENDPOINT);
    expect(first!.init.method).toBe("POST");
    const headers = first!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["HTTP-Referer"]).toBeTruthy();
    expect(headers["X-Title"]).toBeTruthy();
    expect(first!.url).not.toContain(KEY);
    expect(first!.body.model).toBe(DEFAULT_MODEL);
    expect(first!.body.tools.map((t: any) => t.function.name)).toEqual(tools.map((t) => t.name));
    expect(first!.body.tools[0]).toMatchObject({ type: "function", function: { description: "tour_show_step description", parameters: tools[0]!.inputSchema } });
    // The second request carries the assistant tool_calls and the tool result.
    const roles = second!.body.messages.map((m: any) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "tool"]);
    expect(first!.body.messages[0].content).toMatch(/call tour_list_targets first/);
    expect(first!.body.messages[0].content).toContain("`text`");
    expect(second!.body.messages[3]).toMatchObject({ tool_call_id: "call_1", content: JSON.stringify({ ok: true }) });
  });

  it("handles several steps and several calls in one step", async () => {
    const { out, calls } = await run([
      completion({ content: null, tool_calls: [toolCall("tour_list_targets", {}, "a"), toolCall("tour_dismiss", "", "b")] }),
      completion({ content: null, tool_calls: [toolCall("tour_show_step", { text: "x" }, "c")] }),
      text("done"),
    ]);
    expect(calls.map((c) => c.name)).toEqual(["tour_list_targets", "tour_dismiss", "tour_show_step"]);
    expect(out.answer).toBe("done");
  });

  it("reports unknown tools and unparsable arguments back to the model instead of crashing", async () => {
    const { events, calls } = await run([completion({ content: null, tool_calls: [toolCall("rm_rf", {}, "a"), toolCall("tour_show_step", "{oops", "b")] }), text("ok")]);
    expect(calls).toEqual([]);
    const results = events.filter((e) => e.type === "result") as Extract<AgentEvent, { type: "result" }>[];
    expect(results.map((r) => r.result.error)).toEqual(["unknown_tool", "bad_arguments"]);
  });

  it("stops after 8 steps by default", async () => {
    const { out, calls, mock } = await run(Array.from({ length: 12 }, () => completion({ content: null, tool_calls: [toolCall("tour_list_targets", {})] })));
    expect(calls).toHaveLength(8);
    expect(mock).toHaveBeenCalledTimes(8);
    expect(out.answer).toMatch(/could not finish/);
  });

  it("summarises what it highlighted when the cap is hit", async () => {
    const { mc } = context();
    mc.executeTool = async () => JSON.stringify({ ok: true, matched: { name: "Change plan" } });
    const s = stub(Array.from({ length: 5 }, () => completion({ content: null, tool_calls: [toolCall("tour_show_step", { text: "Change plan" })] })));
    const out = await ask({ question: "q", mode: "openrouter", modelContext: mc, emit: () => {}, fetch: s.fetch, openrouter: { apiKey: KEY }, maxSteps: 3 });
    expect(out.answer).toBe("I highlighted “Change plan”. Click it to continue, then ask me for the next step.");
  });

  it("treats empty arguments as {} for a tool with no required properties, and rejects them when something is required", async () => {
    const { mc, calls } = context();
    const strict = { name: "tour_show_step", description: "d", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } };
    mc.getTools = async () => [strict, tools[1]!];
    const events: AgentEvent[] = [];
    const s = stub([completion({ content: null, tool_calls: [toolCall("tour_list_targets", "  ", "a"), toolCall("tour_show_step", "", "b")] }), text("ok")]);
    await ask({ question: "q", mode: "openrouter", modelContext: mc, emit: (e) => events.push(e), fetch: s.fetch, openrouter: { apiKey: KEY } });
    expect(calls).toEqual([{ name: "tour_list_targets", input: {} }]);
    const toolMsg = s.requests[1]!.body.messages.filter((m: any) => m.role === "tool").map((m: any) => JSON.parse(m.content));
    expect(toolMsg[1]).toMatchObject({ error: "bad_arguments", message: expect.stringContaining("not valid JSON for tool tour_show_step") });
  });

  it("tells the model to lead on after an interaction", async () => {
    const { requests } = await run([text("hi")]);
    expect(requests[0]!.body.messages[0].content).toContain('"interacted"');
  });

  it("uses the chosen model, including a free-text id", async () => {
    const { requests } = await run([text("hi")], { openrouter: { apiKey: KEY, model: "acme/tiny-1b" } });
    expect(requests[0]!.body.model).toBe("acme/tiny-1b");
  });

  it("aborts the fetch when Stop is pressed", async () => {
    const ctl = new AbortController();
    const { mc } = context();
    const fetch = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
    const events: AgentEvent[] = [];
    const p = ask({ question: "q", mode: "openrouter", modelContext: mc, emit: (e) => events.push(e), fetch: fetch as any, openrouter: { apiKey: KEY }, signal: ctl.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    ctl.abort();
    expect(await p).toEqual({ answer: "", mode: "openrouter" });
    expect(events.at(-1)).toMatchObject({ type: "status", text: "Stopped." });
  });
});

describe("models without tool support", () => {
  const noTools = failure(404, "No endpoints found that support tool use");

  it("falls back to JSON replies with response_format", async () => {
    const { out, calls, requests, events } = await run([
      noTools,
      text(JSON.stringify({ tool: "tour_show_step", args: { text: "Change plan" }, answer: "" })),
      text(JSON.stringify({ tool: "final_answer", args: {}, answer: "Click Change plan." })),
    ]);
    expect(out).toMatchObject({ answer: "Click Change plan.", mode: "openrouter" });
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "Change plan" } }]);
    expect(requests[1]!.body.tools).toBeUndefined();
    expect(requests[1]!.body.response_format).toEqual({ type: "json_object" });
    expect(events.some((e) => e.type === "status" && e.text.includes("does not accept tools"))).toBe(true);
  });

  it("falls back to plain prompting when response_format is rejected too, and reads fenced JSON", async () => {
    const { out, requests } = await run([noTools, failure(400, "response_format json_object is not supported"), text('Sure:\n```json\n{"tool":"final_answer","args":"{}","answer":"Done."}\n```')]);
    expect(out.answer).toBe("Done.");
    expect(requests[2]!.body.response_format).toBeUndefined();
  });
});

describe("malformed replies in JSON mode", () => {
  const noTools = failure(404, "No endpoints found that support tool use");
  const json = (o: object) => text(JSON.stringify(o));

  it("asks the model to reply again instead of ending the run, for bad JSON and bad args", async () => {
    const { out, calls, requests, events } = await run([
      noTools,
      text("not json at all"),
      json({ tool: "tour_show_step", args: "{oops", answer: "" }),
      json({ tool: "tour_show_step", args: { text: "Change plan" }, answer: "" }),
      json({ tool: "final_answer", args: {}, answer: "Click it." }),
    ]);
    expect(out.answer).toBe("Click it.");
    expect(calls).toEqual([{ name: "tour_show_step", input: { text: "Change plan" } }]);
    expect(events.filter((e) => e.type === "error")).toHaveLength(2);
    const fixes = requests.flatMap((r) => r.body.messages).filter((m: any) => m.role === "user" && /not valid JSON/.test(m.content));
    expect(fixes.some((m: any) => m.content.includes("for tool tour_show_step"))).toBe(true);
  });

  it("keeps retrying past three bad replies, up to the step cap, then summarises", async () => {
    const { out, mock } = await run([noTools, ...Array.from({ length: 12 }, () => text("nope"))]);
    expect(mock).toHaveBeenCalledTimes(1 + 8);
    expect(out.answer).toMatch(/could not finish/);
  });

  it("treats empty args as {} for a tool without required properties", async () => {
    const { calls } = await run([noTools, json({ tool: "tour_list_targets", args: " ", answer: "" }), json({ tool: "final_answer", args: {}, answer: "k" })]);
    expect(calls).toEqual([{ name: "tour_list_targets", input: {} }]);
  });
});

describe("errors", () => {
  it.each([
    [401, /key.*\(401\)/i],
    [402, /credits.*\(402\)/i],
    [429, /rate-limited.*\(429\)/i],
  ])("explains %i clearly", async (status, re) => {
    const { events } = await run([failure(status, `upstream said ${KEY}`)]);
    const err = events.find((e) => e.type === "error") as { text: string };
    expect(err.text).toMatch(re);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("surfaces a 200 response that carries an error object", async () => {
    const { events } = await run([{ body: { error: { code: 429, message: "slow down" } } }]);
    expect((events.find((e) => e.type === "error") as { text: string }).text).toMatch(/429/);
  });

  it("scrubs a key echoed by the server in an unknown error", async () => {
    const { events } = await run([failure(500, `boom ${KEY}`)]);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });
});

describe("mode selection", () => {
  it("never picks OpenRouter in Auto without a key", async () => {
    const { mc } = context();
    const fetch = vi.fn();
    const out = await ask({ question: "invoices", modelContext: mc, emit: () => {}, fetch: fetch as any, openrouter: { apiKey: "" } });
    expect(out.mode).toBe("scripted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explicit OpenRouter without a key says so and does not fetch", async () => {
    const { mc } = context();
    const fetch = vi.fn();
    const events: AgentEvent[] = [];
    const out = await ask({ question: "invoices", mode: "openrouter", modelContext: mc, emit: (e) => events.push(e), fetch: fetch as any });
    expect(out.mode).toBe("scripted");
    expect(fetch).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "error" && e.text.includes("API key"))).toBe(true);
  });

  it("Auto uses OpenRouter when there is a key and no on-device model", async () => {
    const { out } = await run([text("hello")], { mode: "auto" });
    expect(out.mode).toBe("openrouter");
  });

  it("Auto prefers the on-device model when it is available", async () => {
    const session = { prompt: vi.fn(async () => JSON.stringify({ tool: "final_answer", args: "{}", answer: "local" })), destroy: vi.fn() };
    const LanguageModel = { availability: async () => "available", create: async () => session };
    const { out, mock } = await run([], { mode: "auto", LanguageModel });
    expect(out).toMatchObject({ answer: "local", mode: "constraint" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("lists cheap models with the default first", () => {
    expect(MODELS[0]!.id).toBe(DEFAULT_MODEL);
    expect(MODELS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("key store", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it("keeps the key in memory unless asked to remember", () => {
    const st = mem();
    const keys = createKeyStore(st as unknown as Storage);
    keys.set(` ${KEY} `, false);
    expect(keys.get()).toBe(KEY);
    expect(st.m.size).toBe(0);
    expect(keys.remembered()).toBe(false);
  });

  it("stores on remember, drops it when unticked, and forgets", () => {
    const st = mem();
    const keys = createKeyStore(st as unknown as Storage);
    keys.set(KEY, true);
    expect(st.m.get(STORAGE_KEY)).toBe(KEY);
    expect(createKeyStore(st as unknown as Storage).get()).toBe(KEY);
    keys.set(KEY, false);
    expect(st.m.size).toBe(0);
    keys.set(KEY, true);
    keys.forget();
    expect(st.m.size).toBe(0);
    expect(keys.get()).toBe("");
  });

  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    const keys = createKeyStore(blocked as unknown as Storage);
    keys.set(KEY, true);
    expect(keys.get()).toBe(KEY);
    keys.forget();
    expect(keys.get()).toBe("");
  });
});

describe("demo page", () => {
  const frames: HTMLIFrameElement[] = [];
  afterEach(() => {
    frames.splice(0).forEach((f) => f.remove());
    localStorage.removeItem(STORAGE_KEY);
    vi.restoreAllMocks();
  });

  async function open() {
    const f = document.createElement("iframe");
    Object.assign(f.style, { position: "fixed", top: "0", left: "0", width: "1280px", height: "900px", border: "0", background: "#fff" });
    f.src = "/demo/index.html";
    document.body.append(f);
    frames.push(f);
    await new Promise((r) => f.addEventListener("load", r, { once: true }));
    const win = f.contentWindow as Window & typeof globalThis;
    const sent: { url: string; init: RequestInit }[] = [];
    win.fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), init });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Use the highlighted button." } }] }));
    }) as typeof fetch;
    await vi.waitFor(() => expect(f.contentDocument!.getElementById("or-model")!.children.length).toBeGreaterThan(1), { timeout: 8000 });
    return { doc: f.contentDocument!, win, sent };
  }
  const ask1 = (doc: Document, q: string) => {
    const form = doc.getElementById("ask") as HTMLFormElement;
    (form.elements.namedItem("mode") as HTMLSelectElement).value = "openrouter";
    (form.elements.namedItem("q") as HTMLInputElement).value = q;
    form.requestSubmit();
  };
  const type = (doc: Document, win: Window & typeof globalThis, id: string, v: string) => {
    const el = doc.getElementById(id) as HTMLInputElement;
    el.value = v;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  };

  it("uses the key only in the request, never in the transcript, DOM text or console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const { doc, win, sent } = await open();
    const input = doc.getElementById("or-key") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("off");
    type(doc, win, "or-key", KEY);
    ask1(doc, "How do I change my plan?");
    await vi.waitFor(() => expect(doc.querySelector("#transcript li.answer")).not.toBeNull(), { timeout: 8000 });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(ENDPOINT);
    expect((sent[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(doc.body.textContent).not.toContain(KEY);
    expect(doc.documentElement.outerHTML.replace(/value="[^"]*"/g, "")).not.toContain(KEY);
    expect(win.location.href).not.toContain(KEY);
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // not remembered by default
    expect(doc.getElementById("or-note")!.textContent).toMatch(/stays in this browser.*spending limit/i);
  }, 20_000);

  it("remembers on request and forgets on button press", async () => {
    const { doc, win } = await open();
    type(doc, win, "or-key", KEY);
    const remember = doc.getElementById("or-remember") as HTMLInputElement;
    remember.checked = true;
    remember.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(KEY);
    (doc.getElementById("or-forget") as HTMLButtonElement).click();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect((doc.getElementById("or-key") as HTMLInputElement).value).toBe("");
    expect(remember.checked).toBe(false);
  }, 20_000);

  it("does not call OpenRouter in Auto without a key", async () => {
    const { doc, sent } = await open();
    const form = doc.getElementById("ask") as HTMLFormElement;
    (form.elements.namedItem("q") as HTMLInputElement).value = "How do I change my plan?";
    form.requestSubmit();
    await vi.waitFor(() => expect(doc.querySelector("#transcript li.answer")).not.toBeNull(), { timeout: 8000 });
    expect(sent).toHaveLength(0);
  }, 20_000);
});
