import { allElements, composedClosest, composedContains } from "./dom.js";
import { INTERACTIVE, interactiveAncestor } from "./interactive.js";
import { accName, newCache } from "./name.js";
import { matchTier, norm } from "./normalize.js";
import { isVisible } from "./visibility.js";

export interface Hit {
  target: Element;
  tier: 0 | 1;
  ratio: number;
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK"]);
const NAMING = "[aria-label],[aria-labelledby],[title],[alt],[placeholder],input,select,textarea,svg";

// Block boundaries add spaces to names that textContent lacks.
const squash = (s: string | null): string => norm(s).replace(/\s/g, "");

/**
 * Accessible-name matching over visible, allowed elements. Returns the
 * candidates of the winning tier, or [] for `not_found`. `q` is `norm`ed.
 */
export function textHits(root: ParentNode, q: string, allowed: (el: Element) => boolean, skip?: (el: Element) => boolean): Hit[] {
  const cache = newCache(skip);
  const qs = squash(q);
  const hits = new Map<Element, Hit>();

  for (const el of allElements(root)) {
    if (SKIP.has(el.tagName)) continue;
    // Cheap prefilter: the text could contain the query, or the element
    // carries a naming attribute / is a shadow host / labelled field.
    const naming = el.matches(NAMING) || !!el.shadowRoot || !!(el as HTMLInputElement).labels?.length || el.getRootNode().nodeType === 11;
    if (!naming && !squash(el.textContent).includes(qs)) continue;
    if (!allowed(el) || !isVisible(el)) continue;
    const best = matchTier(accName(el, cache).name, q);
    if (!best) continue;

    let target = interactiveAncestor(el) ?? el;
    // Label collapse: a match on or inside a <label> is its control.
    const label = composedClosest(el, "label") as HTMLLabelElement | null;
    if (label && !interactiveAncestor(el)) {
      const c = label.control;
      target = c && allowed(c) && isVisible(c) ? c : label;
    }
    if (target !== el && !allowed(target)) continue;

    const prev = hits.get(target);
    if (!prev || best.tier < prev.tier || (best.tier === prev.tier && best.ratio > prev.ratio)) hits.set(target, { target, ...best });
  }

  // Ancestor collapse: drop any target that contains another target.
  let list = [...hits.values()];
  list = list.filter((a) => !list.some((b) => b !== a && composedContains(a.target, b.target)));
  if (!list.length) return [];

  const top = Math.min(...list.map((h) => h.tier));
  let tier = list.filter((h) => h.tier === top);
  // Prefer interactive within a tier; prose substring hits never count.
  const inter = tier.filter((h) => h.target.matches(INTERACTIVE));
  if (inter.length) tier = inter;
  else if (top === 1) return [];
  return tier;
}
