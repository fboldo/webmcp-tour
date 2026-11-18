// Spike 001: register one hand-rolled tool and record the API shape the host exposes.
(() => {
  const log = [];
  const out = document.getElementById("log");
  const host = new URLSearchParams(location.search).get("host") ?? "unknown";
  function record(event, data) {
    const entry = { t: Math.round(performance.now()), host, event, ...data };
    log.push(entry);
    out.textContent += JSON.stringify(entry) + "\n";
    // Best effort: send to the spike server so headless/remote runs leave evidence on disk.
    fetch("/log", { method: "POST", body: JSON.stringify(entry), keepalive: true }).catch(() => {});
  }
  window.__spike = { log };

  const docMC = "modelContext" in document ? document.modelContext : undefined;
  const navMC = "modelContext" in navigator ? navigator.modelContext : undefined;
  const mc = docMC ?? navMC;
  const methods = (o) => {
    const names = new Set();
    for (let p = o; p && p !== Object.prototype && p !== EventTarget.prototype; p = Object.getPrototypeOf(p))
      for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor") names.add(k);
    return [...names].sort();
  };
  const shape = {
    userAgent: navigator.userAgent,
    isSecureContext,
    polyfillRequested: new URLSearchParams(location.search).has("polyfill"),
    documentModelContext: docMC ? docMC.constructor?.name ?? typeof docMC : null,
    navigatorModelContext: navMC ? navMC.constructor?.name ?? typeof navMC : null,
    sameObject: docMC ? docMC === document.modelContext : null,
    methods: mc ? methods(mc) : [],
    registerToolLength: mc?.registerTool?.length ?? null,
  };
  record("shape", shape);
  if (!mc) { record("no-api", {}); return; }

  for (const type of ["toolchange", "toolactivated", "toolcancel"])
    mc.addEventListener?.(type, (e) => record("event:" + type, { toolName: e.toolName ?? null }));

  let calls = 0;
  const tool = {
    name: "spike_probe",
    title: "Spike probe (title field)",
    description:
      "Diagnostic tool for a compatibility spike. Call it with sleepMs (0-600000) to hold the call open " +
      "that long; it returns what the page saw: the execute arguments, the abort signal, and timings.",
    inputSchema: {
      type: "object",
      properties: { sleepMs: { type: "number", description: "How long to hold the call open, in ms." } },
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input, second) {
      const id = ++calls;
      const started = performance.now();
      const sig = second?.signal;
      const secondInfo = {
        typeofSecond: typeof second,
        secondKeys: second && typeof second === "object" ? Object.keys(second).concat(methods(second)) : null,
        secondCtor: second?.constructor?.name ?? null,
        hasSignal: sig instanceof AbortSignal,
        signalAbortedAtStart: sig?.aborted ?? null,
      };
      record("execute:start", { id, input, ...secondInfo });
      const sleepMs = Math.max(0, Math.min(600000, Number(input?.sleepMs) || 0));
      let aborted = null;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, sleepMs);
        sig?.addEventListener("abort", () => {
          aborted = { afterMs: Math.round(performance.now() - started), reason: String(sig.reason) };
          record("execute:abort", { id, ...aborted });
          clearTimeout(timer);
          resolve();
        });
      });
      // Heartbeats would be nicer, but a single end record is enough to see when the page finished.
      const result = { ok: true, id, sleptMs: Math.round(performance.now() - started), aborted, ...secondInfo };
      record("execute:end", result);
      return result;
    },
  };

  let ret;
  try {
    ret = mc.registerTool(tool, { signal: new AbortController().signal });
  } catch (e) {
    record("register:throw", { name: e?.name, message: e?.message });
    return;
  }
  const isPromise = ret && typeof ret.then === "function";
  record("register:returned", { isPromise, value: isPromise ? "Promise" : String(ret) });
  Promise.resolve(ret).then(
    async (v) => {
      record("register:resolved", { value: v === undefined ? "undefined" : String(v) });
      // Duplicate-name behaviour (plan: rejects with InvalidStateError).
      try { await mc.registerTool(tool); record("register:duplicate-accepted", {}); }
      catch (e) { record("register:duplicate-rejected", { name: e?.name, message: e?.message }); }
      // Does the page's own view of the tool keep title + annotations? (getTools is in the draft.)
      if (mc.getTools) {
        try {
          const tools = await mc.getTools();
          record("getTools", { tools: tools.map((t) => ({ name: t.name, title: t.title, annotations: t.annotations, keys: methods(t).concat(Object.keys(t)) })) });
        } catch (e) { record("getTools:error", { name: e?.name, message: e?.message }); }
      }
    },
    (e) => record("register:rejected", { name: e?.name, message: e?.message }),
  );
})();
