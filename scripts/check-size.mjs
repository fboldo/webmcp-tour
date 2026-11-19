// Size budget gate: fails when a built artifact exceeds its gzip budget.
// ESM entries are measured bundled with the shared chunks they import,
// tree-shaken and minified (what a consumer's bundler ships); the published
// files stay readable.
//   engine: what `import { createTour } from "webmcp-tour"` costs.
//   full:   the script-tag build, tools included.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";

const KB = 1024;
const bundle = (options) => buildSync({ bundle: true, write: false, minify: true, format: "esm", target: "es2022", logLevel: "error", ...options }).outputFiles[0].text;
const budgets = [
  { label: "engine (createTour from dist/index.js)", max: 16 * KB, source: () => bundle({ stdin: { contents: `import { createTour } from "./dist/index.js"; console.log(createTour);`, resolveDir: resolve("."), loader: "js" } }) },
  // Script-tag build, already minified.
  { label: "full (dist/webmcp-tour.js, IIFE)", max: 16 * KB, source: () => readFileSync("dist/webmcp-tour.js") },
];

let failed = false;
for (const { label, max, source } of budgets) {
  let code;
  try {
    code = source();
  } catch (e) {
    console.error(`✗ ${label}: cannot measure (${String(e.message).split("\n")[0]}) — run the build first`);
    failed = true;
    continue;
  }
  const size = gzipSync(code, { level: 9 }).length;
  const ok = size <= max;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${(size / KB).toFixed(2)} KB gzip (budget ${(max / KB).toFixed(0)} KB)`);
}

process.exit(failed ? 1 : 0);
