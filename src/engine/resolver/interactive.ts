import { parentComposed } from "./dom.js";

const ROLES = [
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox",
  "menuitemradio", "option", "combobox", "textbox", "searchbox", "slider", "spinbutton", "treeitem",
].map((r) => `[role=${r}]`);
const TABINDEX = "[tabindex]:not([tabindex='-1'])";
const STRICT = [
  "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
  "[contenteditable='']", "[contenteditable=true]", ...ROLES,
];

export const INTERACTIVE = [...STRICT, TABINDEX].join(",");
const STRICT_SELECTOR = STRICT.join(",");
const LANDMARK = /^(MAIN|NAV|ASIDE|HEADER|FOOTER|SECTION|ARTICLE|BODY|FORM)$/;

/**
 * Nearest interactive ancestor (or self). A control, not a container: an
 * element interactive only through `tabindex` counts only if it is not a
 * landmark and contains no other control.
 */
export function interactiveAncestor(el: Element): Element | null {
  for (let n: Element | null = el; n; n = parentComposed(n)) {
    if (!n.matches(INTERACTIVE)) continue;
    if (n.matches(STRICT_SELECTOR)) return n;
    if (!LANDMARK.test(n.tagName) && !n.querySelector(INTERACTIVE)) return n;
  }
  return null;
}
