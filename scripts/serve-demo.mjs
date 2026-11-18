// Static server for the demo: serves the repo root so /demo/ and /dist/ both resolve.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".map": "application/json" };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/") {
    res.writeHead(302, { location: "/demo/" });
    return res.end();
  }
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(root, path));
  // The W3C polyfill is served from node_modules for the demo only; it is not part of the package.
  const polyfill = join(root, "node_modules/@w3c/webmcp-polyfill/dist/polyfill.js");
  if (!(file.startsWith(join(root, "demo") + "/") || file.startsWith(join(root, "dist") + "/") || file === polyfill)) {
    res.statusCode = 404;
    return res.end("not found");
  }
  try {
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`demo: http://127.0.0.1:${port}/demo/`));
