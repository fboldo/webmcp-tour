// Drives Playwright MCP (the pinned @playwright/mcp) as a real MCP client over stdio, the way a
// desktop agent would: navigate to the probe page, list tools, call the page tool with growing
// sleepMs to find where the call times out.
//
//   node serve.mjs &   then   node run-playwright-mcp.mjs <variant>
//   variants: default (stock CLI, no config) | noflag | flag | flag-polyfill | noflag-polyfill |
//             flag-initpage (flag + init-page.cjs raising the page default timeout)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const variant = process.argv[2] ?? "flag";
const flag = variant.startsWith("flag");
const stock = variant === "default";
const polyfill = variant.includes("polyfill");
const sleeps = (process.argv[3] ?? "200,4000,6000,30000,65000,130000").split(",").map(Number);

const dir = await mkdtemp(join(tmpdir(), "pwmcp-"));
const config = {
  browser: {
    browserName: "chromium",
    launchOptions: { channel: "chrome", headless: true, args: flag ? ["--enable-features=WebMCP"] : [] },
    ...(variant.endsWith("initpage") ? { initPage: [new URL("./init-page.cjs", import.meta.url).pathname] } : {}),
  },
};
await writeFile(join(dir, "config.json"), JSON.stringify(config));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    new URL("./node_modules/@playwright/mcp/cli.js", import.meta.url).pathname,
    ...(stock ? ["--browser", "chrome", "--headless"] : ["--config", join(dir, "config.json")]),
    "--isolated",
  ],
  stderr: "pipe",
});
const client = new Client({ name: "spike-001", version: "0.0.0" });
const out = { variant, when: new Date().toISOString(), config: stock ? "stock CLI: --browser chrome --headless --isolated" : config, listChanged: 0, calls: [] };
client.setNotificationHandler(ToolListChangedNotificationSchema, () => { out.listChanged++; });
await client.connect(transport);
out.server = client.getServerVersion();

const text = (r) => r.content?.map((c) => c.text ?? `[${c.type}]`).join("\n");
const listWebmcp = async () => (await client.listTools()).tools.filter((t) => t.name.startsWith("webmcp_"));

out.toolsBefore = (await listWebmcp()).map((t) => t.name);
const url = `http://localhost:8401/?host=playwright-mcp-${variant}${polyfill ? "&polyfill" : ""}`;
const nav = await client.callTool({ name: "browser_navigate", arguments: { url } });
out.navigateResponse = text(nav);
await new Promise((r) => setTimeout(r, 1000));
// Tools are collected with the page snapshot; take one so late registrations are seen too.
await client.callTool({ name: "browser_snapshot", arguments: {} });
const tools = await listWebmcp();
out.webmcpTools = tools;

const probe = tools.find((t) => t.name.includes("spike_probe"));
if (probe) {
  for (const sleepMs of sleeps) {
    const t0 = Date.now();
    let entry;
    try {
      const r = await client.callTool({ name: probe.name, arguments: { sleepMs } }, undefined, { timeout: 600000 });
      entry = { sleepMs, elapsedMs: Date.now() - t0, isError: !!r.isError, text: text(r) };
    } catch (e) {
      entry = { sleepMs, elapsedMs: Date.now() - t0, threw: String(e) };
    }
    out.calls.push(entry);
    console.log(JSON.stringify(entry).slice(0, 300));
  }
}
await client.close();
const file = new URL(`./results/playwright-mcp-${variant}.json`, import.meta.url);
await writeFile(file, JSON.stringify(out, null, 1));
console.log("tools:", tools.map((t) => t.name), "wrote", file.pathname);
