/** Attribute the overlay host carries so the resolver never matches it. */
export const OVERLAY_HOST_ATTR = "data-webmcp-tour-root";

export const parentComposed = (el: Element): Element | null => {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root.nodeType === 11 ? ((root as ShadowRoot).host ?? null) : null;
};

export const composedClosest = (el: Element, sel: string): Element | null => {
  for (let n: Element | null = el; n; n = parentComposed(n)) if (n.matches(sel)) return n;
  return null;
};

export const composedContains = (a: Element, b: Element): boolean => {
  for (let n: Element | null = b; n; n = parentComposed(n)) if (n === a) return true;
  return false;
};

/** Every element under `root`, descending into open shadow roots. */
export function* allElements(root: ParentNode): Generator<Element> {
  for (const el of root.querySelectorAll("*")) {
    yield el;
    if (el.shadowRoot) yield* allElements(el.shadowRoot);
  }
}

/** `root` plus every open shadow root under it. */
export function searchRoots(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [root];
  for (const el of root.querySelectorAll("*")) if (el.shadowRoot) roots.push(...searchRoots(el.shadowRoot));
  return roots;
}
