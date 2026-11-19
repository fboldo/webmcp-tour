import { composedClosest, parentComposed } from "./dom.js";
import { INTERACTIVE, interactiveAncestor } from "./interactive.js";
import { accName, newCache, SKIP } from "./name.js";
import type { Skip } from "./name.js";
import { matchTier, norm } from "./normalize.js";
import { isVisible } from "./visibility.js";

export interface Hit {
  target: Element;
  tier: 0 | 1;
  ratio: number;
}

const NAMING = "[aria-label],[aria-labelledby],[title],[alt],[placeholder],input,select,textarea,svg,meter,output,progress";
// Elements whose name is worked out directly; prose is reached through its text nodes.
const NAMED = `${NAMING},${INTERACTIVE}`;

/** Past this many tied exact matches on controls nobody can pick one: stop looking and say "at least". */
export const MAX_TIED = 50;

// Block boundaries add spaces to names that textContent lacks.
const squash = (s: string | null): string => norm(s).replace(/\s/g, "");

export interface TextHits {
  hits: Hit[];
  /** The search stopped at `MAX_TIED` tied exact matches on controls: `hits` is the first of them, not all. */
  capped: boolean;
}

/**
 * Accessible-name matching over visible, allowed elements. Returns the
 * candidates of the winning tier, or none for `not_found`. `q` is `norm`ed.
 * One pass over the tree: controls and labelled elements are named directly,
 * prose through its text nodes, so the cost grows with the page, not with its depth.
 */
export function textHits(root: ParentNode, q: string, allowed: (el: Element) => boolean, skip?: Skip): TextHits {
  const cache = newCache(skip);
  const qs = squash(q);
  const hits = new Map<Element, Hit>();
  let exact = 0; // controls with an exact match
  let capped = false;

  /** Name `el` and record a hit. True when it matched. */
  const consider = (el: Element): boolean => {
    const best = matchTier(accName(el, cache).name, q);
    if (!best || !allowed(el) || !isVisible(el)) return false; // name first: most elements do not match, and the other checks are not free

    let target = interactiveAncestor(el) ?? el;
    // Label collapse: a match on or inside a <label> is its control.
    const label = composedClosest(el, "label") as HTMLLabelElement | null;
    if (label && !interactiveAncestor(el)) {
      const c = label.control;
      target = c && allowed(c) && isVisible(c) ? c : label;
    }
    if (target !== el && !allowed(target)) return false;

    const prev = hits.get(target);
    if (!prev || best.tier < prev.tier || (best.tier === prev.tier && best.ratio > prev.ratio)) hits.set(target, { target, ...best });
    if (best.tier === 0 && prev?.tier !== 0 && target.matches(INTERACTIVE) && ++exact > MAX_TIED) capped = true;
    return true;
  };

  // A text node that could be part of the name: name the element around it, and its parents while their
  // text is no longer than the query (the name may be split across elements).
  const squashed = new Map<Node, string>();
  const flat = (n: Node): string => squashed.get(n) ?? squashed.set(n, squash(n.textContent)).get(n)!;
  const seed = (t: Text): void => {
    const s = flat(t);
    if (!s || !qs.includes(s)) return;
    for (let el = t.parentElement; el && !consider(el); el = el.parentElement)
      if (flat(el.parentElement ?? el).length > qs.length) break;
  };

  const walk = (from: ParentNode, inShadow: boolean): void => {
    const w = (from.ownerDocument ?? (from as Document)).createTreeWalker(from, 1 | 4, {
      acceptNode: (n) => (n.nodeType === 1 && SKIP.has((n as Element).tagName) ? 2 : 1),
    });
    for (let n = w.nextNode(); n && !capped; n = w.nextNode()) {
      if (n.nodeType === 3) {
        seed(n as Text);
        continue;
      }
      const el = n as Element;
      if (inShadow || el.shadowRoot || el.matches(NAMED)) consider(el);
      if (el.shadowRoot) walk(el.shadowRoot, true);
    }
  };
  walk(root, false);

  // Ancestor collapse: drop any target that contains another target. Each target walks its ancestors once.
  const dropped = new Set<Element>();
  for (const t of hits.keys()) for (let n = parentComposed(t); n; n = parentComposed(n)) if (hits.has(n)) dropped.add(n);
  const list = [...hits.values()].filter((h) => !dropped.has(h.target));
  if (!list.length) return { hits: [], capped };

  const top = Math.min(...list.map((h) => h.tier));
  let tier = list.filter((h) => h.tier === top);
  // Prefer interactive within a tier; prose substring hits never count.
  const inter = tier.filter((h) => h.target.matches(INTERACTIVE));
  if (inter.length) tier = inter;
  else if (top === 1) return { hits: [], capped };
  return capped ? { hits: tier.slice(0, MAX_TIED), capped } : { hits: tier, capped };
}
