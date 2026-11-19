import { allElements, composedClosest, parentComposed } from "./dom.js";
import { INTERACTIVE } from "./interactive.js";
import { accName, contentText, newCache } from "./name.js";
import type { Skip } from "./name.js";
import { clean, clip, norm } from "./normalize.js";
import { isVisible } from "./visibility.js";
import type { Candidate } from "./types.js";

const HEADING = "h1,h2,h3,h4,h5,h6,[role=heading]";
const LANDMARK =
  "nav[aria-label],[role=navigation][aria-label],aside[aria-label],section[aria-label],form[aria-label],[role=region][aria-label],[role=group][aria-label],header,footer,nav,aside";
/** Visible text of an element, minus excluded subtrees, hidden content and what was typed into fields. */
const text = (el: Element, skip?: Skip): string => contentText(el, newCache(skip));
const short = (s: string | undefined | null): string | undefined => (s ? clip(norm(s), 60) || undefined : undefined);

/**
 * Reasoning context for an `ambiguous` candidate: nearest *preceding* heading
 * in document order + row text + nearest labelled landmark or group.
 */
export function candidateContext(el: Element, skip?: Skip): Pick<Candidate, "heading" | "row" | "landmark"> {
  const row = composedClosest(el, "tr,[role=row],li");
  const heading = precedingHeading(el, skip);
  const landmark = composedClosest(el, LANDMARK);
  return {
    ...opt("row", short(row && row !== el ? text(row, skip) : null)),
    ...opt("heading", short(heading && text(heading, skip))),
    ...opt("landmark", landmark ? short(landmark.getAttribute("aria-label") || landmark.tagName.toLowerCase()) : undefined),
  };
}

const excludedAbove = (el: Element, skip?: Skip): boolean => {
  for (let n: Element | null = el; skip && n; n = parentComposed(n)) if (skip(n)) return true;
  return false;
};

function precedingHeading(el: Element, skip?: Skip): Element | null {
  let start: Element = el;
  for (let r = start.getRootNode(); r.nodeType === 11; r = start.getRootNode()) start = (r as ShadowRoot).host;
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  walker.currentNode = start;
  for (let n = walker.previousNode(), i = 0; n && i < 5000; n = walker.previousNode(), i++) {
    if ((n as Element).matches(HEADING) && (n as Element).checkVisibility() && !excludedAbove(n as Element, skip)) return n as Element;
  }
  return null;
}

/** Where a control sits, for the page outline: its labelled landmark, else the heading above it, else the bare landmark. Case kept. */
export function outlineContext(el: Element, skip?: Skip): string | undefined {
  const lm = composedClosest(el, LANDMARK);
  const label = lm?.getAttribute("aria-label");
  const heading = precedingHeading(el, skip);
  const v = label || (heading && text(heading, skip)) || lm?.tagName.toLowerCase();
  return v ? clip(clean(v), 60) || undefined : undefined;
}

const opt = <K extends string>(k: K, v: string | undefined) => (v === undefined ? {} : ({ [k]: v } as Record<K, string>));

/** Visible interactive names to suggest on `not_found`; capped in count and length. */
export function nearNames(root: ParentNode, q: string, allowed: (el: Element) => boolean, skip?: Skip, max = 8): string[] {
  const words = q.split(" ").filter((w) => w.length > 1);
  const cache = newCache(skip);
  const seen = new Map<string, number>();
  let scanned = 0;
  for (const el of allElements(root)) {
    if (!el.matches(INTERACTIVE) || ++scanned > 400 || !allowed(el) || !isVisible(el)) continue;
    const name = clip(norm(accName(el, cache).name), 60);
    if (!name || seen.has(name)) continue;
    seen.set(name, words.filter((w) => name.includes(w)).length);
  }
  return [...seen].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n);
}

/** "Name, landmark" for a live-region announcement: the element's accessible name and its nearest landmark. */
export function locationOf(el: Element): { name: string; landmark?: string } {
  const lm = composedClosest(el, `main,[role=main],${LANDMARK}`);
  const label = lm?.getAttribute("aria-label");
  const landmark = lm && lm !== el ? clip((label || (lm.getAttribute("role") ?? lm.tagName.toLowerCase())).replace(/\s+/g, " ").trim(), 60) : undefined;
  return { name: clip(accName(el, newCache()).name.replace(/\s+/g, " ").trim(), 60), ...opt("landmark", landmark) };
}
