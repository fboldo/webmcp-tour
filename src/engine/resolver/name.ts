/**
 * Simplified accessible name: aria-labelledby > aria-label > <label> > text
 * content > title/alt/SVG <title> > placeholder. No extra "visible text" name.
 */
const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK"]);
const FIELDS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

type Cache = Map<Element, string>;

const buttonValue = (el: Element): string =>
  el.tagName === "INPUT" && /^(submit|button|reset)$/i.test((el as HTMLInputElement).type) ? (el as HTMLInputElement).value : "";

function contentText(node: Node, cache: Cache): string {
  if (node.nodeType === 3) return (node as Text).data;
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const hit = cache.get(el);
  if (hit !== undefined) return hit;
  let out = "";
  if (!SKIP.has(el.tagName) && el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("inert")) {
    const cs = getComputedStyle(el);
    // Invisible content (incl. opacity:0) must not name its ancestors.
    if (cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0") {
      const label = el.getAttribute("aria-label");
      if (el.tagName === "IMG") out = el.getAttribute("alt") ?? "";
      else if (el.localName === "svg") out = el.querySelector("title")?.textContent ?? "";
      else if (FIELDS.has(el.tagName)) out = buttonValue(el);
      else if (label?.trim()) out = label;
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
  FIELDS.has(el.tagName) || el.tagName === "IMG" || el.namespaceURI?.endsWith("/svg")
    ? buttonValue(el)
    : childrenText(el, cache);

function referenced(el: Element, ids: string, cache: Cache): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  return ids
    .split(/\s+/)
    .map((id) => {
      const ref = root.getElementById(id) ?? el.ownerDocument.getElementById(id);
      return ref ? contentText(ref, cache) || (ref.textContent ?? "") : "";
    })
    .join(" ");
}

export const newCache = (): Cache => new Map();

export function accName(el: Element, cache: Cache): { name: string; source: string } {
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = referenced(el, by, cache);
    if (t.trim()) return { name: t, source: "aria-labelledby" };
  }
  const al = el.getAttribute("aria-label");
  if (al?.trim()) return { name: al, source: "aria-label" };
  const labels = (el as HTMLInputElement).labels;
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
