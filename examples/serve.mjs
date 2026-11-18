// Static server for the examples that need no bundler: `node examples/serve.mjs <script-tag|embed>`.
// Serves the example folder at /, plus /dist/ (the built library), /shared/ and, for ?polyfill, /vendor/polyfill.js.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const name = process.argv[2];
if (!/^[a-z-]+$/.test(name ?? "")) {
  console.error("usage: node examples/serve.mjs <script-tag|embed>");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 5173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".map": "application/json" };
const roots = [
  ["/dist/", join(repo, "dist")],
  ["/shared/", join(repo, "examples", "shared")],
  ["/", join(repo, "examples", name)],
];

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file =
    path === "/vendor/polyfill.js"
      ? join(repo, "node_modules", "@w3c", "webmcp-polyfill", "dist", "polyfill.js")
      : (() => {
          const [prefix, dir] = roots.find(([p]) => path.startsWith(p));
          const f = normalize(join(dir, path.slice(prefix.length)));
          return f.startsWith(dir + "/") ? f : null;
        })();
  try {
    if (!file) throw new Error("outside");
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`${name}: http://localhost:${port}/`));
