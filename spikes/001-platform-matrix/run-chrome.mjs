// Drives the installed Google Chrome (channel "chrome") through the probe page in four variants:
// with/without --enable-features=WebMCP, with/without the W3C polyfill. For native variants it also
// talks to the CDP WebMCP domain (what native hosts and CDP bridges see) and tests cancellation and
// a long-running call.
//
//   node serve.mjs &   then   node run-chrome.mjs [--long]
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";

const base = "http://localhost:8401/";
const long = process.argv.includes("--long");
const variants = [
  { id: "chrome-noflag", args: [], polyfill: false },
  { id: "chrome-flag", args: ["--enable-features=WebMCP"], polyfill: false },
  { id: "chrome-noflag-polyfill", args: [], polyfill: true },
  { id: "chrome-flag-polyfill", args: ["--enable-features=WebMCP"], polyfill: true },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { when: new Date().toISOString(), variants: {} };

for (const v of variants) {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: v.args });
  const page = await browser.newPage();
  const r = (report.variants[v.id] = { args: v.args, chromeVersion: browser.version() });
  await page.goto(`${base}?host=${v.id}${v.polyfill ? "&polyfill" : ""}`);
  await sleep(1500);
  r.pageLog = await page.evaluate(() => window.__spike.log);

  // What a CDP bridge sees.
  const cdp = await page.context().newCDPSession(page);
  const events = (r.cdpEvents = []);
  for (const e of ["toolsAdded", "toolsRemoved", "toolInvoked", "toolResponded"])
    cdp.on(`WebMCP.${e}`, (p) => events.push({ at: Date.now(), event: e, ...p }));
  try {
    await cdp.send("WebMCP.enable");
    await sleep(500);
    r.cdpEnable = "ok";
  } catch (e) {
    r.cdpEnable = `error: ${e.message}`;
  }

  if (r.cdpEnable === "ok" && events.some((e) => e.event === "toolsAdded" && e.tools.length)) {
    const frameId = (await cdp.send("Page.getFrameTree")).frameTree.frame.id;
    const waitFor = async (pred, ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { const hit = events.find(pred); if (hit) return hit; await sleep(50); }
      return null;
    };
    // 1. Quick call.
    const quick = await cdp.send("WebMCP.invokeTool", { frameId, toolName: "spike_probe", input: { sleepMs: 200 } });
    r.quickCall = await waitFor((e) => e.event === "toolResponded" && e.invocationId === quick.invocationId, 5000);
    // 2. Cancel a call mid-flight: does the page's execute signal abort? Does toolcancel fire?
    const slow = await cdp.send("WebMCP.invokeTool", { frameId, toolName: "spike_probe", input: { sleepMs: 60000 } });
    await sleep(1000);
    await cdp.send("WebMCP.cancelInvocation", { invocationId: slow.invocationId });
    r.cancelCall = await waitFor((e) => e.event === "toolResponded" && e.invocationId === slow.invocationId, 5000);
    // 3. Optional: a 310 s call — does Chrome itself impose a timeout?
    if (long) {
      const t0 = Date.now();
      const lng = await cdp.send("WebMCP.invokeTool", { frameId, toolName: "spike_probe", input: { sleepMs: 310000 } });
      const done = await waitFor((e) => e.event === "toolResponded" && e.invocationId === lng.invocationId, 330000);
      r.longCall = { elapsedMs: Date.now() - t0, done };
    }
    // 4. Playwright's own (non-MCP) frame.webmcp API, for comparison with Playwright MCP.
    try {
      r.playwrightFrameTools = await page.mainFrame().webmcp.tools();
    } catch (e) {
      r.playwrightFrameTools = `error: ${e.message}`;
    }
    await sleep(300);
    r.pageLogAfterCalls = await page.evaluate(() => window.__spike.log);
  } else if (v.polyfill) {
    // Polyfill only: call through the polyfill's own executeTool, cancel via the caller signal.
    r.polyfillCalls = await page.evaluate(async () => {
      const mc = document.modelContext;
      const [tool] = await mc.getTools();
      const quick = JSON.parse(await mc.executeTool(tool, { sleepMs: 200 }));
      const ac = new AbortController();
      const p = mc.executeTool(tool, { sleepMs: 60000 }, { signal: ac.signal }).then(String, (e) => `rejected: ${e.name}`);
      setTimeout(() => ac.abort(), 1000);
      return { quick, cancelled: await p };
    });
    await sleep(300);
    // Can Playwright's isolated-world reader see polyfilled tools? (Playwright MCP uses the same path.)
    try {
      r.playwrightFrameTools = await page.mainFrame().webmcp.tools();
    } catch (e) {
      r.playwrightFrameTools = `error: ${e.message}`;
    }
    r.pageLogAfterCalls = await page.evaluate(() => window.__spike.log);
  }
  await browser.close();
  console.log(v.id, "done");
}

await writeFile(new URL("./results/chrome" + (long ? "-long" : "") + ".json", import.meta.url), JSON.stringify(report, null, 1));
console.log("wrote results/chrome" + (long ? "-long" : "") + ".json");
