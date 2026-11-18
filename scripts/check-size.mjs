// Size budget gate: fails when a built file exceeds its gzip budget.
// ESM entries are measured bundled with the shared chunks they import and
// minified (what a consumer's bundler ships); the published file stays readable.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";

const KB = 1024;
const budgets = [
  // Engine ESM (root entry). The budget: ≤ 10 KB gzip, minified.
  { file: "dist/index.js", max: 10 * KB, minify: true },
  // Script-tag build, already minified.
  { file: "dist/webmcp-tour.js", max: 10 * KB },
];

let failed = false;
for (const { file, max, minify } of budgets) {
  let source;
  try {
    source = readFileSync(file);
  } catch {
    console.error(`✗ ${file}: missing — run the build first`);
    failed = true;
    continue;
  }
  if (minify) {
    const { outputFiles } = buildSync({ entryPoints: [file], bundle: true, write: false, minify: true, format: "esm", target: "es2022", logLevel: "error" });
    source = outputFiles[0].text;
  }
  const size = gzipSync(source, { level: 9 }).length;
  const ok = size <= max;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${file}${minify ? " (minified)" : ""}: ${(size / KB).toFixed(2)} KB gzip (budget ${(max / KB).toFixed(0)} KB)`);
}

process.exit(failed ? 1 : 0);
