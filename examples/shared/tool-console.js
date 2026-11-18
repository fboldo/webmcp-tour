// In-page tool tester for ?polyfill runs: lists document.modelContext tools and calls them.
// Native hosts (Chrome, ChatGPT Desktop, ...) bring their own UI; this exists for the polyfill only.
const ctx = document.modelContext;
const root = document.createElement("details");
root.setAttribute("data-tour-exclude", "");
root.style.cssText = "position:fixed;right:12px;bottom:12px;width:min(360px,calc(100vw - 24px));z-index:10;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:8px 10px;font:13px system-ui,sans-serif";
root.innerHTML = `
  <summary>Tool tester (polyfill)</summary>
  <p><label>Tool <select name="tool" style="width:100%"></select></label></p>
  <p><label>Input (JSON) <textarea name="input" rows="3" style="width:100%;font:12px monospace">{}</textarea></label></p>
  <p><button type="button" name="run">Run</button> <button type="button" name="refresh">Refresh</button></p>
  <pre name="out" aria-live="polite" style="max-height:200px;overflow:auto;white-space:pre-wrap;margin:0">–</pre>`;
document.body.append(root);
const $ = (n) => root.querySelector(`[name=${n}]`);

async function refresh() {
  const tools = ctx ? await ctx.getTools() : [];
  $("tool").replaceChildren(...tools.map((t) => new Option(t.name)));
  $("out").textContent = ctx ? `${tools.length} tools: ${tools.map((t) => t.name).join(", ")}` : "No document.modelContext: is the polyfill loaded?";
}
$("refresh").addEventListener("click", refresh);
$("run").addEventListener("click", async () => {
  try {
    const tool = (await ctx.getTools()).find((t) => t.name === $("tool").value);
    const out = await ctx.executeTool(tool, JSON.parse($("input").value || "{}"));
    $("out").textContent = typeof out === "string" ? JSON.stringify(JSON.parse(out), null, 2) : JSON.stringify(out, null, 2);
  } catch (e) {
    $("out").textContent = `${e?.name}: ${e?.message}`;
  }
});
setTimeout(refresh, 400); // tools register asynchronously
ctx?.addEventListener?.("toolchange", refresh);
