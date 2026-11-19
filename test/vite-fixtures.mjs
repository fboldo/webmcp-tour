// Vite plugin: serves test/fixtures/* raw under /fx/, with a real CSP header on HTML.
// Plain JS because the repo has no @types/node.
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const DIST_IIFE = fileURLToPath(new URL("../dist/webmcp-tour.js", import.meta.url));
// No 'unsafe-inline' anywhere: the overlay must work under this.
const ENV = fileURLToPath(new URL("../examples/shared/webmcp-env.js", import.meta.url));
const POLYFILL = fileURLToPath(new URL("../node_modules/@w3c/webmcp-polyfill/dist/polyfill.js", import.meta.url));
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
  "connect-src 'self'; base-uri 'none'; form-action 'none'";

export function fixtures() {
  return {
    name: "webmcp-tour:fixtures",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url ?? "/", "http://x").pathname;
        if (path === "/fx/webmcp-tour.js") {
          // The built script-tag artifact: `pnpm build` must have run.
          try {
            res.setHeader("content-type", "text/javascript");
            return res.end(await readFile(DIST_IIFE));
          } catch {
            res.statusCode = 404;
            return res.end();
          }
        }
        if (path === "/shared/webmcp-env.js") {
          // The demo's capability detection, shared with the examples.
          res.setHeader("content-type", "text/javascript");
          return res.end(await readFile(ENV));
        }
        if (path === "/fx/polyfill.js") {
          // The W3C polyfill's own script-tag bundle (a devDependency; never shipped by this package).
          res.setHeader("content-type", "text/javascript");
          return res.end(await readFile(POLYFILL));
        }
        if (!path.startsWith("/fx/") || path.includes("..")) return next();
        try {
          const body = await readFile(join(FIXTURES, path.slice(4)));
          const html = extname(path) === ".html";
          res.setHeader("content-type", html ? "text/html; charset=utf-8" : "text/css");
          if (html) res.setHeader("content-security-policy", CSP);
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}
