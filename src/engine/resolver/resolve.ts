import { candidateContext, nearNames, outlineContext } from "./context.js";
import { INTERACTIVE } from "./interactive.js";
import { allElements, composedContains, OVERLAY_HOST_ATTR, searchRoots } from "./dom.js";
import { accName, EDITABLE, newCache } from "./name.js";
import type { Skip } from "./name.js";
import { clip, norm } from "./normalize.js";
import { reveal } from "./occlusion.js";
import { textHits } from "./text.js";
import type { Candidate, LocateResult, Matched, Outline, ResolveError, ResolveInput, ResolverOptions, ResolveResult, TargetInfo, TargetSource } from "./types.js";
import { isVisible } from "./visibility.js";

const MAX_TEXT = 200;
const MAX_CANDIDATES = 10;
const MAX_IDS = 50;
const HEADINGS = "h1,h2,h3,h4,h5,h6,[role=heading]";
const norm2 = (s: string) => s.replace(/\s+/g, " ").trim();
const AUTHOR_EXCLUDED = `[data-tour-exclude],[${OVERLAY_HOST_ATTR}]`;
const ALWAYS_EXCLUDED = `[aria-hidden=true],[inert],script,style,template,noscript,${AUTHOR_EXCLUDED}`;
const EDITORS = EDITABLE.replace("input,select,", "");

/**
 * A selector may only say where an element is, never what hidden values it holds:
 * `:has()` and attribute value operators would turn "found / not found" into a question
 * the page answers about content that is not visible.
 */
function probing(selector: string): boolean {
  const s = selector
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h: string) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff) || 0xfffd))
    .replace(/\\(.)/gs, "$1");
  return /:has\(/i.test(s) || /[~|^$*]=/.test(s) || /\[\s*(?:[^\]=|]*\|)?\s*value\s*[\]=~|^$*]/i.test(s);
}

const invalid = (message: string): ResolveError => ({ ok: false, error: "invalid_input", message });

const IMPLICIT: Record<string, string> = {
  A: "link", BUTTON: "button", SELECT: "combobox", TEXTAREA: "textbox", SUMMARY: "button",
  H1: "heading", H2: "heading", H3: "heading", H4: "heading", H5: "heading", H6: "heading",
};
const INPUT_ROLE: Record<string, string> = {
  checkbox: "checkbox", radio: "radio", button: "button", submit: "button", reset: "button",
  range: "slider", number: "spinbutton", search: "searchbox",
};

function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  if (el.tagName === "INPUT") return INPUT_ROLE[(el as HTMLInputElement).type] ?? "textbox";
  return el.tagName === "A" && !el.hasAttribute("href") ? undefined : IMPLICIT[el.tagName];
}

/** Ids already reported as duplicated, so the console warns once per id. */
const warned = new Set<string>();

/**
 * Resolves `[data-tour-id]` in the document (or only inside `scope`). An id declared on more
 * than one element is ambiguous: it comes back with every match in `duplicates` and no
 * first-wins, so markup earlier in the page cannot take over a declared target.
 */
export function domTargets(doc: Document, scope?: Element): TargetSource {
  const root: ParentNode = scope ?? doc;
  const find = (id: string): Element[] => {
    const all = [...root.querySelectorAll(`[data-tour-id="${CSS.escape(id)}"]`)];
    if (all.length > 1 && !warned.has(id)) {
      warned.add(id);
      console.warn(`webmcp-tour: data-tour-id "${id}" is declared on ${all.length} elements; it cannot be pointed at until it is unique.`);
    }
    return all;
  };
  return {
    get(id) {
      const [element, ...rest] = find(id);
      if (!element) return undefined;
      const attr = (n: string) => element.getAttribute(`data-tour-${n}`) ?? undefined;
      return { element, reveal: attr("reveal"), description: attr("description"), label: attr("label"), page: attr("page"), ...(rest.length ? { duplicates: [element, ...rest] } : {}) };
    },
    ids: () => [...new Set([...root.querySelectorAll("[data-tour-id]")].map((e) => e.getAttribute("data-tour-id")!))],
  };
}

function setup(opts: ResolverOptions) {
  const doc = opts.document ?? document;
  const { scope, overlayHost } = opts;
  let extra = "";
  if (opts.exclude) {
    try {
      doc.createDocumentFragment().querySelector(opts.exclude);
    } catch {
      throw new TypeError("webmcp-tour: invalid `exclude` selector");
    }
    extra = `,${opts.exclude}`;
  }
  const excludedSel = ALWAYS_EXCLUDED + extra;
  const excluded = (el: Element): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) {
      if (n.matches(excludedSel) || n === overlayHost) return true;
    }
    return false;
  };
  const allowed = (el: Element): boolean => !excluded(el) && (!scope || composedContains(scope, el));
  const authorSel = AUTHOR_EXCLUDED + extra;
  const skip: Skip = (el, hard) => el.matches(hard ? authorSel : excludedSel) || el === overlayHost;
  return { doc, root: (scope ?? doc) as ParentNode, allowed, skip };
}

export function describe(by: Matched["by"], el: Element, opts: ResolverOptions = {}): Matched {
  const { skip } = setup(opts);
  const cache = newCache(skip);
  const name = clip(norm(accName(el, cache).name), 80);
  const html = el as HTMLElement;
  // Excluded content inside the element must not leak through its text.
  // Nor may what a person typed into a field or editor.
  const guarded = el.matches(EDITORS) || !!el.querySelector(EDITORS) || [...allElements(el)].some((e) => e !== el && skip(e));
  const text = clip(norm(guarded ? accName(el, cache).name : (html.innerText ?? el.textContent)), 120);
  const role = roleOf(el);
  return { by, tag: el.tagName.toLowerCase(), ...(role ? { role } : {}), name, text, disabled: el.matches(":disabled,[aria-disabled=true]") };
}

/** Document order across shadow boundaries (host before its shadow content). */
function inDocumentOrder(roots: ParentNode[], els: Element[]): Element[] {
  if (els.length < 2) return els;
  const order = new Map<Element, number>();
  let i = 0;
  for (const r of roots) for (const el of r.querySelectorAll("*")) order.set(el, i++);
  return els.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Locate the element for a step: `target` -> `selector` -> `text`.
 * Pure: it reads layout and the DOM, and mutates nothing.
 */
export function locate(input: ResolveInput, opts: ResolverOptions = {}): LocateResult {
  const given = (["target", "selector", "text"] as const).filter((k) => input[k] !== undefined);
  if (given.length !== 1) return invalid("Provide exactly one of target, selector or text.");
  const by = given[0]!;
  const value = input[by];
  if (typeof value !== "string" || !value.trim()) return invalid(`${by} must be a non-empty string.`);
  if (by === "text" && value.length > MAX_TEXT) return invalid(`text is over ${MAX_TEXT} characters.`);
  const { index } = input;
  if (index !== undefined && !(Number.isInteger(index) && index >= 0)) return invalid("index must be a non-negative integer.");

  const { doc, root, allowed, skip } = setup(opts);

  if (by === "target") {
    const src = opts.targets ?? domTargets(doc, opts.scope);
    const t = src.get(value);
    const live = t?.duplicates?.filter(allowed);
    if (live && live.length > 1) {
      const cache = newCache();
      const list = live.slice(0, MAX_CANDIDATES).map((el, index): Candidate => {
        const m = describe("target", el, opts);
        return { index, tag: m.tag, ...(m.role ? { role: m.role } : {}), name: m.name || clip(norm(accName(el, cache).name), 80), disabled: m.disabled, ...candidateContext(el, skip) };
      });
      return { ok: false, error: "ambiguous_target", candidates: list, count: live.length };
    }
    if (t && live?.length === 1) t.element = live[0]!;
    if (!t || !allowed(t.element)) {
      const available = src.ids().filter((id) => { const x = src.get(id); return x && allowed(x.element); }).slice(0, MAX_IDS).map((id) => clip(id, 80));
      return { ok: false, error: "target_not_found", available };
    }
    if (!isVisible(t.element)) return { ok: false, error: "not_visible", ...(t.reveal ? { reveal: t.reveal } : {}) };
    return { ok: true, element: t.element, matched: describe("target", t.element, opts) };
  }

  const roots = searchRoots(root);
  let candidates: Element[];
  let q = "";
  let more = false; // the text search stopped early: there are more candidates than listed
  if (by === "selector") {
    if (probing(value)) return invalid("That selector tests attribute values or uses :has(), which is not allowed. Point with `text` or `target`, or use a plain selector such as #id, .class, tag or [attr=name].");
    try {
      candidates = roots.flatMap((r) => [...r.querySelectorAll(value)]).filter((el) => allowed(el) && isVisible(el));
    } catch {
      return { ok: false, error: "invalid_selector" };
    }
    candidates = inDocumentOrder(roots, [...new Set(candidates)]);
  } else {
    q = norm(value);
    if (!q) return invalid("text must contain letters or digits.");
    const found = textHits(root, q, allowed, skip);
    more = found.capped;
    candidates = inDocumentOrder(roots, found.hits.map((h) => h.target));
  }

  if (!candidates.length) return { ok: false, error: "not_found", near: nearNames(root, q, allowed, skip) };
  let chosen: Element | undefined;
  if (index !== undefined) {
    chosen = candidates[index];
    if (!chosen) return invalid(`index out of range: ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}.`);
  } else if (candidates.length === 1) chosen = candidates[0];
  if (!chosen) {
    const cache = newCache();
    const list: Candidate[] = candidates.slice(0, MAX_CANDIDATES).map((el, i) => {
      const m = describe(by, el, opts);
      return { index: i, tag: m.tag, ...(m.role ? { role: m.role } : {}), name: m.name || clip(norm(accName(el, cache).name), 80), disabled: m.disabled, ...candidateContext(el, skip) };
    });
    return { ok: false, error: "ambiguous", candidates: list, count: candidates.length, ...(more ? { truncated: true as const } : {}) };
  }
  return { ok: true, element: chosen, matched: describe(by, chosen, opts) };
}

/** `locate`, then scroll the match into view and report occlusion. */
export function resolve(input: ResolveInput, opts: ResolverOptions = {}): ResolveResult {
  const r = locate(input, opts);
  return r.ok ? { ok: true, element: r.element, matched: { ...r.matched, ...reveal(r.element) } } : r;
}

/** Declared targets the tour may point at (not excluded, in scope), capped. `total` counts them all. */
export function listTargets(opts: ResolverOptions, max = MAX_IDS): { targets: TargetInfo[]; total: number } {
  if (!opts.document && typeof document === "undefined") return { targets: [], total: 0 };
  const { doc, allowed } = setup(opts);
  const src = opts.targets ?? domTargets(doc, opts.scope);
  const cache = newCache();
  const targets: TargetInfo[] = [];
  let total = 0;
  for (const id of src.ids()) {
    const t = src.get(id);
    const live = t?.duplicates?.filter(allowed);
    if (!t || (live && live.length > 1) || !allowed(live?.[0] ?? t.element) || total++ >= max) continue;
    if (live?.length === 1) t.element = live[0]!;
    const text = (s: string | undefined, n: number) => clip((s ?? "").replace(/\s+/g, " ").trim(), n);
    const info: TargetInfo = { id: clip(id, 80), label: text(t.label, 80) || text(accName(t.element, cache).name, 80), visible: isVisible(t.element) };
    const description = text(t.description, 300);
    const reveal = text(t.reveal, 200);
    if (description) info.description = description;
    if (reveal) info.reveal = reveal;
    targets.push(info);
  }
  return { targets, total };
}

const MAX_CONTROLS = 60;
const MAX_HEADINGS = 30;
const MAX_SCAN = 1500;

/**
 * What a person sees on the page, for agents that cannot see it: visible headings and
 * interactive controls (role, accessible name, nearest landmark or heading). Never values,
 * attributes, URLs or hidden content. Honours scope and exclusions; capped.
 */
export function outline(opts: ResolverOptions): Outline {
  if (!opts.document && typeof document === "undefined") return { headings: [], controls: [] };
  const { root, allowed, skip } = setup(opts);
  const cache = newCache(skip);
  const name = (el: Element) => clip(norm2(accName(el, cache).name), 60);
  const out: Outline = { headings: [], controls: [] };
  let scanned = 0;
  for (const el of allElements(root)) {
    const isHeading = el.matches(HEADINGS);
    if ((!isHeading && !el.matches(INTERACTIVE)) || ++scanned > MAX_SCAN || !allowed(el) || !isVisible(el)) continue;
    const n = name(el);
    if (!n) continue;
    if (isHeading) {
      if (out.headings.length < MAX_HEADINGS) out.headings.push(n);
      else out.truncated = true;
    } else if (out.controls.length < MAX_CONTROLS) {
      const context = outlineContext(el, skip);
      const role = roleOf(el);
      out.controls.push({ ...(role ? { role } : {}), name: n, ...(context ? { context } : {}) });
    } else out.truncated = true;
  }
  if (scanned > MAX_SCAN) out.truncated = true;
  return out;
}
