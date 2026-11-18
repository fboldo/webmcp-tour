// Static server for the fixtures. Every HTML response carries a strict CSP
// header — no 'unsafe-inline' anywhere — so the whole suite runs under it.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 4005);
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!/^\/(fixtures|src)\//.test(path)) return res.writeHead(404).end();
  try {
    const body = await readFile(join(ROOT, path));
    const headers = { "content-type": TYPES[extname(path)] ?? "application/octet-stream" };
    if (extname(path) === ".html") headers["content-security-policy"] = CSP;
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`spike-005 on http://localhost:${PORT}/fixtures/`));
