// Run the labelled corpus against the resolver in real Chromium, once per
// rule variant. Usage: node run.mjs [--variant name] [--verbose]
// Writes results/<variant>.json and results/summary.md.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { openFixture, contextOptions } from "./fixture-server.mjs";

const RESOLVER = readFileSync(new URL("./resolver.js", import.meta.url), "utf8");
// "dev" = the corpus the rule changes were derived from; "holdout" = pages
// and queries labelled after the rules were frozen.
const load = (f, set) => JSON.parse(readFileSync(new URL(f, import.meta.url))).map((q) => ({ ...q, set }));
const QUERIES = [...load("./queries.json", "dev"), ...load("./queries-holdout.json", "holdout")];

// "plan" = plan.md v2 as written. Single-flag variants measure each proposed
// rule change alone; "recommended" is the combination the README proposes.
export const VARIANTS = {
  plan: {},
  "+labelToControl": { labelToControl: true },
  "+preferInteractive": { preferInteractive: true },
  "+visibleTextToo": { visibleTextToo: true },
  "+strictVisibility": { strictVisibility: true },
  "+caseTiebreak": { caseTiebreak: true },
  "+substringInteractiveOnly": { substringInteractiveOnly: true },
  "+substringBest2x": { substringBest: 2 },
  "+opacityFields": { opacityFields: true },
  "+leafTabindex": { leafTabindex: true },
  // Frozen before the held-out set was labelled.
  "recommended-frozen": {
    labelToControl: true, preferInteractive: true, strictVisibility: true,
    substringInteractiveOnly: true, opacityFields: true,
  },
  // + the one rule the held-out set exposed.
  recommended: {
    labelToControl: true, preferInteractive: true, strictVisibility: true,
    substringInteractiveOnly: true, opacityFields: true, leafTabindex: true,
  },
  "recommended+visibleTextToo+caseTiebreak": {
    labelToControl: true, preferInteractive: true, strictVisibility: true,
    substringInteractiveOnly: true, opacityFields: true, leafTabindex: true, visibleTextToo: true, caseTiebreak: true,
  },
};

const args = process.argv.slice(2);
const only = args.includes("--variant") ? args[args.indexOf("--variant") + 1] : null;
const verbose = args.includes("--verbose");

function locate(page, spec) {
  let loc;
  if (spec.css) loc = page.locator(spec.css);
  else if (spec.role) loc = page.getByRole(spec.role, { name: spec.nameRe ? new RegExp(spec.nameRe, "i") : spec.name, exact: spec.exact ?? !spec.nameRe });
  else if (spec.label) loc = page.getByLabel(spec.label, { exact: true });
  else if (spec.placeholder) loc = page.getByPlaceholder(spec.placeholder, { exact: spec.exact ?? true });
  else throw new Error("bad expect " + JSON.stringify(spec));
  return loc.filter({ visible: true });
}

async function expectedHandle(page, spec) {
  const loc = locate(page, spec);
  const n = await loc.count();
  if (spec.nth != null) return n > spec.nth ? loc.nth(spec.nth).elementHandle() : { bad: `nth ${spec.nth} of ${n}` };
  if (n !== 1) return { bad: `${n} matches` };
  return loc.elementHandle();
}

// Same element, or one inside the other with near-identical boxes (a span in
// a link, a shadow-internal <button> in its host) — highlighting either
// looks the same to the user.
const SAME = ([a, b]) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const up = (n) => n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null);
  const contains = (x, y) => { for (let n = y; n; n = up(n)) if (n === x) return true; return false; };
  if (!contains(a, b) && !contains(b, a)) return false;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const area = (r) => Math.max(1, r.width * r.height);
  return Math.max(area(ra), area(rb)) / Math.min(area(ra), area(rb)) <= 4;
};

function classify(q, res, matchedExpected, matchedAccept) {
  const outcome = res.ok ? "match" : res.error;
  const accept = q.accept ?? [];
  if (q.expect === "ambiguous" || q.expect === "not_found") {
    if (outcome === q.expect || accept.includes(outcome)) return "pass";
    if (outcome === "match" && matchedAccept) return "pass";
    if (outcome === "match") return q.expect === "ambiguous" ? "silent_pick" : "false_positive";
    if (q.expect === "not_found") return "false_ambiguous";
    return "missed";
  }
  if (outcome === "match") return matchedExpected || matchedAccept ? "pass" : "wrong_element";
  if (accept.includes(outcome)) return "pass";
  if (outcome === "ambiguous") return "spurious_ambiguous";
  return "missed";
}

const browser = await chromium.launch();
const ctx = await browser.newContext(contextOptions);
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });

const pages = [...new Set(QUERIES.map((q) => q.page))];
const results = Object.fromEntries(Object.keys(VARIANTS).map((v) => [v, []]));
const badLabels = [];

for (const name of pages) {
  const page = await openFixture(ctx, name);
  await page.addScriptTag({ content: RESOLVER });
  for (const q of QUERIES.filter((x) => x.page === name)) {
    const exp = typeof q.expect === "object" ? await expectedHandle(page, q.expect) : null;
    if (exp && exp.bad) { badLabels.push(`${name} "${q.q}": ${exp.bad}`); continue; }
    const accepts = [];
    for (const a of q.accept ?? []) if (typeof a === "object") {
      const h = await expectedHandle(page, a);
      if (h.bad) badLabels.push(`${name} "${q.q}" accept: ${h.bad}`); else accepts.push(h);
    }
    for (const [vname, vopts] of Object.entries(VARIANTS)) {
      if (only && vname !== only) continue;
      await page.evaluate(() => scrollTo(0, 0));
      const res = await page.evaluate(([t, o]) => window.__tourResolve(t, o), [q.q, { ...vopts, index: q.index }]);
      const chosen = await page.evaluateHandle(() => window.__tourLast?.chosen ?? null);
      const matchedExpected = exp ? await page.evaluate(SAME, [chosen, exp]) : false;
      let matchedAccept = false;
      for (const h of accepts) matchedAccept ||= await page.evaluate(SAME, [chosen, h]);
      const verdict = classify(q, res, matchedExpected, matchedAccept);
      results[vname].push({ set: q.set, page: name, q: q.q, index: q.index, cat: q.cat, expect: q.expect, verdict, res });
      if (verbose && vname === (only ?? "plan") && verdict !== "pass")
        console.log(`[${vname}/${q.set}] ${verdict.padEnd(18)} ${name} "${q.q}" →`, JSON.stringify(res.ok ? res.matched : { error: res.error, count: res.count, c: res.candidates?.slice(0, 4).map((c) => `${c.tag}:${c.name}`) }));
    }
  }
  await page.close();
}
await browser.close();

if (badLabels.length) { console.error("BAD LABELS:\n" + badLabels.join("\n")); }

const VERDICTS = ["pass", "wrong_element", "silent_pick", "false_positive", "spurious_ambiguous", "false_ambiguous", "missed"];
const lines = [`Corpus: ${QUERIES.length} queries on ${pages.length} pages. Chromium ${browser.version()}.`];
for (const set of ["dev", "holdout", "all"]) {
  lines.push("", `### ${set}`, "",
    `| variant | pass | rate | ${VERDICTS.slice(1).join(" | ")} | median ms | max ms |`,
    `|---|---|---|${VERDICTS.slice(1).map(() => "---").join("|")}|---|---|`);
  for (const [v, all] of Object.entries(results)) {
    const rs = set === "all" ? all : all.filter((r) => r.set === set);
    if (!rs.length) continue;
    const count = (k) => rs.filter((r) => r.verdict === k).length;
    const ms = rs.map((r) => r.res.ms ?? 0).sort((a, b) => a - b);
    lines.push(`| ${v} | ${count("pass")}/${rs.length} | ${((100 * count("pass")) / rs.length).toFixed(1)}% | ${VERDICTS.slice(1).map(count).join(" | ")} | ${ms[ms.length >> 1].toFixed(1)} | ${ms[ms.length - 1].toFixed(1)} |`);
  }
}
if (!only) for (const [v, rs] of Object.entries(results))
  writeFileSync(new URL(`./results/${v.replace(/\W+/g, "_").replace(/^_/, "")}.json`, import.meta.url), JSON.stringify(rs, null, 1));
const md = lines.join("\n");
writeFileSync(new URL("./results/summary.md", import.meta.url), md + "\n");
console.log(md);
process.exitCode = badLabels.length ? 2 : 0;
