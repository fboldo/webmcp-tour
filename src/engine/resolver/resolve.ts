import { candidateContext, nearNames } from "./context.js";
import { allElements, composedContains, OVERLAY_HOST_ATTR, searchRoots } from "./dom.js";
import { accName, newCache } from "./name.js";
import { clip, norm } from "./normalize.js";
import { reveal } from "./occlusion.js";
import { textHits } from "./text.js";
import type { Candidate, LocateResult, Matched, ResolveError, ResolveInput, ResolverOptions, ResolveResult, TargetInfo, TargetSource } from "./types.js";
import { isVisible } from "./visibility.js";

const MAX_TEXT = 200;
const MAX_CANDIDATES = 10;
const MAX_IDS = 50;
const ALWAYS_EXCLUDED =
  `[aria-hidden=true],[inert],script,style,template,noscript,[data-tour-exclude],[${OVERLAY_HOST_ATTR}]`;

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

/** Resolves `[data-tour-id]` in the document, in document order. */
export function domTargets(doc: Document): TargetSource {
  const find = (id: string) => doc.querySelector(`[data-tour-id="${CSS.escape(id)}"]`);
  return {
    get(id) {
      const element = find(id);
      const attr = (n: string) => element!.getAttribute(`data-tour-${n}`) ?? undefined;
      return element && { element, reveal: attr("reveal"), description: attr("description"), label: attr("label"), page: attr("page") };
    },
    ids: () => [...doc.querySelectorAll("[data-tour-id]")].map((e) => e.getAttribute("data-tour-id")!),
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
  const skip = (el: Element): boolean => el.matches(excludedSel) || el === overlayHost;
  return { doc, root: (scope ?? doc) as ParentNode, allowed, skip };
}

export function describe(by: Matched["by"], el: Element, opts: ResolverOptions = {}): Matched {
  const { skip } = setup(opts);
  const cache = newCache(skip);
  const name = clip(norm(accName(el, cache).name), 80);
  const html = el as HTMLElement;
  // Excluded content inside the element must not leak through its text.
  const hasExcluded = [...allElements(el)].some((e) => e !== el && skip(e));
  const text = clip(norm(hasExcluded ? accName(el, cache).name : (html.innerText ?? el.textContent)), 120);
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
    const src = opts.targets ?? domTargets(doc);
    const t = src.get(value);
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
  if (by === "selector") {
    try {
      candidates = roots.flatMap((r) => [...r.querySelectorAll(value)]).filter((el) => allowed(el) && isVisible(el));
    } catch {
      return { ok: false, error: "invalid_selector" };
    }
    candidates = inDocumentOrder(roots, [...new Set(candidates)]);
  } else {
    q = norm(value);
    if (!q) return invalid("text must contain letters or digits.");
    candidates = inDocumentOrder(roots, textHits(root, q, allowed, skip).map((h) => h.target));
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
      return { index: i, tag: m.tag, ...(m.role ? { role: m.role } : {}), name: m.name || clip(norm(accName(el, cache).name), 80), disabled: m.disabled, ...candidateContext(el) };
    });
    return { ok: false, error: "ambiguous", candidates: list, count: candidates.length };
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
  const { doc, allowed } = setup(opts);
  const src = opts.targets ?? domTargets(doc);
  const cache = newCache();
  const targets: TargetInfo[] = [];
  let total = 0;
  for (const id of src.ids()) {
    const t = src.get(id);
    if (!t || !allowed(t.element) || total++ >= max) continue;
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
