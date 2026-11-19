/**
 * Simplified accessible name: aria-labelledby > aria-label > <label> > text
 * content > title/alt/SVG <title> > placeholder. No extra "visible text" name.
 */
export const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK"]);
const FIELDS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/**
 * `skip` marks elements whose content never names an ancestor (excluded ones). With `hard`
 * it only answers for author exclusions, not for `aria-hidden` and `inert`.
 */
export type Skip = (el: Element, hard?: boolean) => boolean;
type Cache = Map<Element, string> & { skip?: Skip | undefined; labelled?: Map<Node, Map<Element, HTMLLabelElement[]>> };

/** Fields and editors: what a person typed or chose in them is never a name. */
const EDITOR = "[contenteditable]:not([contenteditable=false]),[role=textbox],[role=searchbox],[role=combobox],[role=spinbutton]";
export const EDITABLE = `${EDITOR},input,select,textarea`;
const editor = (el: Element): boolean => FIELDS.has(el.tagName) || el.matches(EDITOR) || (el as HTMLElement).isContentEditable === true;

const buttonValue = (el: Element): string =>
  el.tagName === "INPUT" && /^(submit|button|reset)$/i.test((el as HTMLInputElement).type) ? (el as HTMLInputElement).value : "";

export function contentText(node: Node, cache: Cache): string {
  if (node.nodeType === 3) return (node as Text).data;
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const hit = cache.get(el);
  if (hit !== undefined) return hit;
  let out = "";
  if (!SKIP.has(el.tagName) && !cache.skip?.(el) && el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("inert")) {
    const cs = getComputedStyle(el);
    // Invisible content (incl. opacity:0) must not name its ancestors.
    if (cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0") {
      const label = el.getAttribute("aria-label");
      if (el.tagName === "IMG") out = el.getAttribute("alt") ?? "";
      else if (el.localName === "svg") out = el.querySelector("title")?.textContent ?? "";
      else if (FIELDS.has(el.tagName)) out = buttonValue(el);
      else if (label?.trim()) out = label;
      else if (editor(el)) out = "";
      else {
        out = childrenText(el, cache);
        if (!cs.display.startsWith("inline") && cs.display !== "contents") out = ` ${out} `;
      }
    }
  }
  cache.set(el, out);
  return out;
}

/** Flat-tree text of an element's children (shadow root + slotted nodes). */
function childrenText(el: Element, cache: Cache): string {
  const kids = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
  let out = "";
  for (const k of kids) {
    if ((k as Element).tagName === "SLOT") {
      const slot = k as HTMLSlotElement;
      const assigned = slot.assignedNodes({ flatten: true });
      for (const a of assigned.length ? assigned : slot.childNodes) out += contentText(a, cache);
    } else out += contentText(k, cache);
  }
  return out;
}

const ownContent = (el: Element, cache: Cache): string =>
  editor(el) || el.tagName === "IMG" || el.namespaceURI?.endsWith("/svg")
    ? buttonValue(el)
    : childrenText(el, cache);

/** Text of a hidden-but-referenced node (the accname rule), without author-excluded subtrees. */
function rawText(node: Node, cache: Cache): string {
  if (node.nodeType === 3) return (node as Text).data;
  if (node.nodeType !== 1 || SKIP.has((node as Element).tagName) || cache.skip?.(node as Element, true)) return "";
  let out = "";
  for (const k of node.childNodes) out += rawText(k, cache);
  return out;
}

function excludedRef(ref: Element, cache: Cache): boolean {
  for (let n: Element | null = ref; n; n = n.parentElement ?? (n.getRootNode() as ShadowRoot).host ?? null) if (cache.skip?.(n, true)) return true;
  return false;
}

function referenced(el: Element, ids: string, cache: Cache): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  return ids
    .split(/\s+/)
    .map((id) => {
      const ref = root.getElementById(id) ?? el.ownerDocument.getElementById(id);
      return ref && !excludedRef(ref, cache) ? contentText(ref, cache) || rawText(ref, cache) : "";
    })
    .join(" ");
}

export const newCache = (skip?: Skip): Cache => Object.assign(new Map<Element, string>(), { skip, labelled: new Map<Node, Map<Element, HTMLLabelElement[]>>() });

/**
 * `el.labels`, worked out once per tree from each label's control: asking every control
 * for `labels` walks the tree each time, which on a big page is most of the lookup.
 */
function labelsOf(el: Element, cache: Cache): HTMLLabelElement[] | undefined {
  const root = el.getRootNode() as ParentNode;
  let map = cache.labelled?.get(root);
  if (!map) {
    map = new Map();
    for (const l of root.querySelectorAll("label")) {
      const c = l.control;
      if (c) map.set(c, [...(map.get(c) ?? []), l]);
    }
    cache.labelled?.set(root, map);
  }
  return map.get(el);
}

export function accName(el: Element, cache: Cache): { name: string; source: string } {
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = referenced(el, by, cache);
    if (t.trim()) return { name: t, source: "aria-labelledby" };
  }
  const al = el.getAttribute("aria-label");
  if (al?.trim()) return { name: al, source: "aria-label" };
  const labels = labelsOf(el, cache);
  if (labels?.length) {
    const t = [...labels].map((l) => contentText(l, cache)).join(" ");
    if (t.trim()) return { name: t, source: "label" };
  }
  const c = ownContent(el, cache);
  if (c.trim()) return { name: c, source: "content" };
  const t = el.getAttribute("title") || el.getAttribute("alt") || el.querySelector(":scope > title")?.textContent;
  if (t?.trim()) return { name: t, source: "title" };
  const ph = el.getAttribute("placeholder");
  if (ph?.trim()) return { name: ph, source: "placeholder" };
  return { name: "", source: "none" };
}
