/// <reference types="node" />
// Node-side half of the external resolver corpus. The corpus (third-party
// page snapshots) is NOT part of this repo: it is read from the directory in
// WEBMCP_TOUR_CORPUS, and the corpus test skips when that is unset or missing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import type { Page } from "playwright";
import type { BrowserCommand } from "vitest/node";

const CORPUS_DIR = process.env.WEBMCP_TOUR_CORPUS ?? "";
const ORIGIN = "https://fixture.test";

type Spec = { css?: string; role?: string; name?: string; nameRe?: string; exact?: boolean; label?: string; placeholder?: string; nth?: number };
interface Query {
  page: string; q: string; cat?: string; index?: number; note?: string;
  expect: Spec | "ambiguous" | "not_found";
  accept?: (Spec | string)[];
  set?: string;
}
export interface Row { set: string; page: string; q: string; verdict: string; ms: number; detail: string }

const locate = (page: Page, s: Spec) => {
  const loc = s.css
    ? page.locator(s.css)
    : s.role
      ? page.getByRole(s.role as never, { name: s.nameRe ? new RegExp(s.nameRe, "i") : s.name!, exact: s.exact ?? !s.nameRe })
      : s.label
        ? page.getByLabel(s.label, { exact: true })
        : page.getByPlaceholder(s.placeholder!, { exact: s.exact ?? true });
  return loc.filter({ visible: true });
};

async function expected(page: Page, s: Spec) {
  const loc = locate(page, s);
  const n = await loc.count();
  if (s.nth != null) return n > s.nth ? loc.nth(s.nth).elementHandle() : { bad: `nth ${s.nth} of ${n}` };
  return n === 1 ? loc.elementHandle() : { bad: `${n} matches` };
}

// Same element, or one inside the other with near-identical boxes (a span in
// a link, a shadow-internal <button> in its host).
const SAME = ([a, b]: [Element | null, Element | null]): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const up = (n: Element): Element | null => n.parentElement || (n.getRootNode() instanceof ShadowRoot ? (n.getRootNode() as ShadowRoot).host : null);
  const contains = (x: Element, y: Element) => { for (let n: Element | null = y; n; n = up(n)) if (n === x) return true; return false; };
  if (!contains(a, b) && !contains(b, a)) return false;
  const area = (r: DOMRect) => Math.max(1, r.width * r.height);
  const ra = area(a.getBoundingClientRect()), rb = area(b.getBoundingClientRect());
  return Math.max(ra, rb) / Math.min(ra, rb) <= 4;
};

function classify(q: Query, res: { ok: boolean; error?: string }, matchedExpected: boolean, matchedAccept: boolean): string {
  const outcome = res.ok ? "match" : res.error!;
  const accept = (q.accept ?? []).filter((a): a is string => typeof a === "string");
  if (q.expect === "ambiguous" || q.expect === "not_found") {
    if (outcome === q.expect || accept.includes(outcome)) return "pass";
    if (outcome === "match" && matchedAccept) return "pass";
    if (outcome === "match") return q.expect === "ambiguous" ? "silent_pick" : "false_positive";
    return q.expect === "not_found" ? "false_ambiguous" : "missed";
  }
  if (outcome === "match") return matchedExpected || matchedAccept ? "pass" : "wrong_element";
  if (accept.includes(outcome)) return "pass";
  return outcome === "ambiguous" ? "spurious_ambiguous" : "missed";
}

// Labels were authored against Chromium; run there only.
export const corpusAvailable: BrowserCommand<[]> = (ctx) =>
  ctx.context.browser()?.browserType().name() === "chromium" &&
  CORPUS_DIR !== "" &&
  existsSync(join(CORPUS_DIR, "queries.json")) && existsSync(join(CORPUS_DIR, "fixtures"));

export const runCorpus: BrowserCommand<[]> = async (ctx) => {
  const load = (f: string, set: string): Query[] =>
    (JSON.parse(readFileSync(join(CORPUS_DIR, f), "utf8")) as Query[]).map((q) => ({ ...q, set }));
  const queries = [...load("queries.json", "dev"), ...load("queries-holdout.json", "holdout")];

  const bundle = await build({
    entryPoints: [new URL("../../src/engine/resolver/index.ts", import.meta.url).pathname],
    bundle: true, format: "iife", globalName: "__tourResolver", write: false, target: "es2022",
  });
  const script = bundle.outputFiles[0]!.text;

  const browser = ctx.context.browser()!;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US", colorScheme: "light" });
  const rows: Row[] = [];
  const bad: string[] = [];
  try {
    for (const name of [...new Set(queries.map((q) => q.page))]) {
      const html = gunzipSync(readFileSync(join(CORPUS_DIR, "fixtures", `${name}.html.gz`))).toString("utf8");
      const page = await context.newPage();
      // Fully offline: the fixture is fulfilled from disk, everything else aborted.
      await page.route("**/*", (route) =>
        route.request().url() === `${ORIGIN}/${name}`
          ? route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html })
          : route.abort(),
      );
      await page.goto(`${ORIGIN}/${name}`, { waitUntil: "load" });
      await page.addScriptTag({ content: script });
      for (const q of queries.filter((x) => x.page === name)) {
        const exp = typeof q.expect === "object" ? await expected(page, q.expect) : null;
        if (exp && "bad" in exp) { bad.push(`${name} "${q.q}": ${exp.bad}`); continue; }
        const accepts = [];
        for (const a of q.accept ?? []) if (typeof a === "object") {
          const h = await expected(page, a);
          if ("bad" in h) bad.push(`${name} "${q.q}" accept: ${h.bad}`); else accepts.push(h);
        }
        await page.evaluate(() => scrollTo(0, 0));
        const res = await page.evaluate(([input]) => {
          const r = (window as any).__tourResolver;
          const t0 = performance.now();
          const out = r.locate(input);
          const ms = performance.now() - t0;
          (window as any).__tourLast = out.ok ? out.element : null;
          const { element, ...rest } = out;
          return { ...rest, ms };
        }, [{ text: q.q, ...(q.index != null ? { index: q.index } : {}) }]);
        const chosen = await page.evaluateHandle(() => (window as any).__tourLast ?? null);
        const matchedExpected = exp ? await page.evaluate(SAME, [chosen, exp] as never) : false;
        let matchedAccept = false;
        for (const h of accepts) matchedAccept ||= await page.evaluate(SAME, [chosen, h] as never);
        const verdict = classify(q, res, matchedExpected, matchedAccept);
        const detail = res.ok
          ? `${(res as any).matched.tag}:${(res as any).matched.name}`
          : `${(res as any).error}${(res as any).count ? ` x${(res as any).count}` : ""}`;
        rows.push({ set: q.set!, page: name, q: q.q, verdict, ms: (res as any).ms, detail });
      }
      await page.close();
    }
  } finally {
    await context.close();
  }
  return { rows, bad };
};
