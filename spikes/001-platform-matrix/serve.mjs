// Tiny static server for the probe page. http://localhost is a secure context.
// POST /log appends one JSON line to results/log.ndjson (evidence from runs we cannot watch).
import { createServer } from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("./public/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8401);
const logFile = process.env.LOG ?? new URL("./results/log.ndjson", import.meta.url).pathname;
await mkdir(new URL("./results/", import.meta.url).pathname, { recursive: true });
const polyfill = new URL("./node_modules/@w3c/webmcp-polyfill/dist/polyfill.js", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/log") {
    let body = "";
    for await (const chunk of req) body += chunk;
    await appendFile(logFile, body.trim() + "\n");
    res.writeHead(204).end();
    return;
  }
  const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  // Serve the W3C polyfill IIFE straight from node_modules (not vendored into the spike).
  const file = path === "polyfill.js" ? polyfill : join(root, path);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`probe page: http://localhost:${port}/`));
