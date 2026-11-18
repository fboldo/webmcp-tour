// Size budget gate: fails when a built file exceeds its gzip budget.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const KB = 1024;
const budgets = [
  // Engine ESM (root entry). The plan's budget: ≤ 10 KB gzip.
  { file: "dist/index.js", max: 10 * KB },
];

let failed = false;
for (const { file, max } of budgets) {
  let source;
  try {
    source = readFileSync(file);
  } catch {
    console.error(`✗ ${file}: missing — run the build first`);
    failed = true;
    continue;
  }
  const size = gzipSync(source, { level: 9 }).length;
  const ok = size <= max;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${(size / KB).toFixed(2)} KB gzip (budget ${(max / KB).toFixed(0)} KB)`);
}

process.exit(failed ? 1 : 0);
