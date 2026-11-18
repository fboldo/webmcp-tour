/** Input of `resolve`: exactly one of `target`, `selector`, `text`. */
export interface ResolveInput {
  /** Declared `data-tour-id`. */
  target?: string;
  /** CSS selector; matches visible elements only. */
  selector?: string;
  /** Visible text, label or aria-label of the element. */
  text?: string;
  /** 0-based pick among tied candidates (document order). */
  index?: number;
}

/** A declared-target lookup (the default one reads `data-tour-id`). */
export interface TargetSource {
  get(id: string): { element: Element; reveal?: string | undefined; description?: string | undefined; label?: string | undefined; page?: string | undefined } | null | undefined;
  ids(): string[];
}

export interface ResolverOptions {
  /** Only elements inside this element can be resolved. */
  scope?: Element | undefined;
  /** CSS selector of elements (and their subtrees) that can never be resolved. */
  exclude?: string | undefined;
  /** The tour's own overlay host; never resolvable. Also matched by `data-webmcp-tour-root`. */
  overlayHost?: Element | null | undefined;
  /** Custom declared targets (`defineTarget`); defaults to `[data-tour-id]` in the document. */
  targets?: TargetSource | undefined;
  /** Document to search; defaults to the global `document`. */
  document?: Document | undefined;
}

export interface Matched {
  by: "target" | "selector" | "text";
  tag: string;
  role?: string;
  name: string;
  text: string;
  disabled: boolean;
}

export interface Reveal {
  /** Whether the element was inside the viewport before the call scrolled. */
  inViewport: boolean;
  scrolledIntoView: boolean;
  /** A fixed/sticky element still covers the element's centre after scrolling. */
  occluded: boolean;
}

/** One declared target as `tour_list_targets` reports it. Page-provided text, clipped. */
export interface TargetInfo {
  id: string;
  label: string;
  description?: string;
  reveal?: string;
  /** Rendered right now; when false, `reveal` says what to do first. */
  visible: boolean;
  /** Where it lives, when not on the current page (`onThisPage` is then false). */
  page?: { id: string; title: string };
  onThisPage?: false;
}

export interface Candidate {
  index: number;
  tag: string;
  role?: string;
  name: string;
  disabled: boolean;
  /** Nearest preceding heading in document order. */
  heading?: string;
  /** Text of the enclosing row/list item. */
  row?: string;
  /** Nearest labelled landmark or group. */
  landmark?: string;
}

export type ResolveError =
  | { ok: false; error: "invalid_input"; message: string }
  | { ok: false; error: "invalid_selector" }
  | { ok: false; error: "target_not_found"; available: string[] }
  | { ok: false; error: "not_found"; near: string[] }
  | { ok: false; error: "not_visible"; reveal?: string }
  | { ok: false; error: "ambiguous"; candidates: Candidate[]; count: number };

/** Pure lookup: no scrolling, no DOM mutation. */
export type LocateResult = { ok: true; element: Element; matched: Matched } | ResolveError;

export type ResolveResult =
  | { ok: true; element: Element; matched: Matched & Reveal }
  | ResolveError;
