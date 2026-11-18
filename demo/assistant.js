// "Ask the assistant" panel: wires demo/agent.js to the page's WebMCP tools and Chrome's Prompt API.
// Everything is feature-detected; a failure here must never break the page.
import { ask, detectModel } from "./agent.js";

const $ = (id) => document.getElementById(id);
const modeLine = $("assistant-mode");
const transcript = $("transcript");
const form = $("ask");
const stop = $("stop");
const download = $("download");
const SAMPLES = ["How do I change my plan?", "Where do I set up two-factor?", "Where can I download invoices?", "How do I delete my account?"];

const forced = new URLSearchParams(location.search).get("agent"); // ?agent=scripted pins the fake agent
const LM = forced === "scripted" ? undefined : globalThis.LanguageModel;
const mc = document.modelContext;

function line(kind, text) {
  const li = document.createElement("li");
  li.className = kind;
  li.textContent = text;
  transcript.append(li);
  transcript.scrollTop = transcript.scrollHeight;
}
const label = { user: "You: ", answer: "Assistant: ", error: "", status: "", call: "→ ", result: "← " };
const show = (e) =>
  line(e.type, label[e.type] + (e.type === "call" ? `${e.tool}(${JSON.stringify(e.args)})` : e.type === "result" ? `${e.tool}: ${JSON.stringify(e.result)}` : e.text));

async function refresh() {
  const state = await detectModel(LM);
  download.hidden = state !== "downloadable";
  modeLine.classList.toggle("scripted", state !== "available");
  modeLine.textContent =
    state === "available"
      ? "On-device model ready (Chrome Prompt API, Gemini Nano). Tool calls are real."
      : `Scripted demo agent — no AI model runs here (Prompt API: ${state}). Canned answers, real tool calls.`;
  return state;
}

try {
  if (!mc) {
    modeLine.textContent = "This browser has no WebMCP (document.modelContext), so the assistant is off.";
    for (const el of form.elements) el.disabled = true;
    throw new Error("no modelContext");
  }
  SAMPLES.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", () => {
      form.q.value = q;
      form.requestSubmit();
    });
    $("samples").append(b);
  });
  await refresh();

  download.addEventListener("click", async () => {
    download.disabled = true;
    try {
      const s = await LM.create({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        monitor: (m) => m.addEventListener("downloadprogress", (e) => (modeLine.textContent = `Downloading model… ${Math.round(e.loaded * 100)}%`)),
      });
      s.destroy?.();
    } catch (e) {
      line("error", `Model download failed: ${e?.message ?? e}`);
    }
    download.disabled = false;
    await refresh();
  });

  let running;
  stop.addEventListener("click", () => running?.abort());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = form.q.value.trim();
    if (!question || running) return;
    form.q.value = "";
    running = new AbortController();
    stop.hidden = false;
    try {
      await ask({ question, mode: forced === "scripted" ? "scripted" : form.mode.value, LanguageModel: LM, modelContext: mc, emit: show, signal: running.signal });
    } catch (err) {
      line("error", String(err?.message ?? err));
    } finally {
      running = undefined;
      stop.hidden = true;
    }
  });
} catch (e) {
  console.info("assistant disabled:", e?.message ?? e);
}
