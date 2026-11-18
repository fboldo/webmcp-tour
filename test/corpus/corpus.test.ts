// External resolver corpus: 159 labelled `text` queries on 17 real-page
// snapshots. The snapshots are third-party content and are never committed:
// they are read from the directory in WEBMCP_TOUR_CORPUS and this suite skips
// when that is unset or missing.
//
// Gates: zero silent-wrong outcomes outside KNOWN_FAILURES, and a
// pass rate of at least 95 %.
import { commands } from "vitest/browser";
import { describe, expect, it } from "vitest";
import type { Row } from "./commands.js";

const SILENT_WRONG = new Set(["wrong_element", "silent_pick", "false_positive"]);
// Page + query pairs that are known to pick the wrong element, with why.
const KNOWN_FAILURES: Record<string, string> = {
  'hackernews "Search"': "unlabelled field (`Search: <input>` with a bare text node); use `selector`",
};

// Custom commands registered in vitest.config.ts (they run in Node).
const run = commands as unknown as { corpusAvailable(): Promise<boolean>; runCorpus(): Promise<{ rows: Row[]; bad: string[] }> };
const available = await run.corpusAvailable();

describe.skipIf(!available)("resolver corpus (external)", { timeout: 300_000 }, () => {
  it("meets the plan's gates", async () => {
    const { rows, bad } = await run.runCorpus();
    expect(bad, "labels that no longer resolve to exactly one element").toEqual([]);

    const fails = rows.filter((r) => r.verdict !== "pass");
    const rate = (rows.length - fails.length) / rows.length;
    const held = rows.filter((r) => r.set === "holdout");
    const heldRate = held.filter((r) => r.verdict === "pass").length / held.length;
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const report = fails.map((r) => `${r.verdict.padEnd(18)} ${r.page} "${r.q}" -> ${r.detail}`).join("\n");
    console.info(
      `corpus: ${rows.length} queries, ${(rate * 100).toFixed(1)}% pass (held-out ${(heldRate * 100).toFixed(1)}%), ` +
        `median ${ms[ms.length >> 1]!.toFixed(1)} ms, max ${ms.at(-1)!.toFixed(1)} ms\n${report}`,
    );

    const unexpected = fails.filter((r) => SILENT_WRONG.has(r.verdict) && !(`${r.page} "${r.q}"` in KNOWN_FAILURES));
    expect(unexpected.map((r) => `${r.verdict} ${r.page} "${r.q}" -> ${r.detail}`), `silent-wrong outcomes\n${report}`).toEqual([]);
    expect(rate, `pass rate\n${report}`).toBeGreaterThanOrEqual(0.95);
    expect(rows.length).toBeGreaterThanOrEqual(150);
  });
});
