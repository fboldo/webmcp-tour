import { domTargets } from "../engine/resolver/index.js";
import type { TargetSource } from "../engine/resolver/index.js";
import type { TargetDefinition } from "./types.js";

type Found = NonNullable<ReturnType<TargetSource["get"]>>;
/** A target that lives on another page: nothing to point at here, only a page to suggest. */
export interface OffPage {
  id: string;
  page: string;
  label?: string | undefined;
  description?: string | undefined;
}

/**
 * `defineTarget` registry layered over `[data-tour-id]`; defined targets win.
 * A target with a `page` other than the current one is off-page: invisible to the
 * resolver (`get`, `ids`) and reported by `offPage`. Without an element or selector,
 * a defined target is only that: the on-page element is the `[data-tour-id]` one.
 */
export class Targets implements TargetSource {
  readonly #defined = new Map<string, TargetDefinition>();
  readonly #listeners = new Set<() => void>();

  constructor(
    readonly current: () => string | undefined,
    /** Only `[data-tour-id]` elements inside this one are targets. */
    readonly scope?: Element,
    /** `false` ignores `[data-tour-id]` markup altogether: only `defineTarget` targets exist. */
    readonly dom = true,
  ) {}

  #dom(): TargetSource {
    return this.dom ? domTargets(document, this.scope) : { get: () => undefined, ids: () => [] };
  }

  /** Called after `defineTarget` adds or removes a definition (DOM targets are read at call time). */
  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  define(def: TargetDefinition): () => void {
    if (!def || typeof def.id !== "string" || !def.id.trim()) throw new TypeError("webmcp-tour: defineTarget needs a non-empty `id`");
    if (def.page !== undefined && (typeof def.page !== "string" || !def.page.trim())) throw new TypeError("webmcp-tour: defineTarget `page` must be a page id");
    if ((def.selector === undefined) === (def.element === undefined) && (def.page === undefined || def.selector !== undefined))
      throw new TypeError("webmcp-tour: defineTarget needs exactly one of `selector` or `element` (or only `page`)");
    if (def.selector !== undefined) document.createDocumentFragment().querySelector(def.selector); // throws SyntaxError when invalid
    const copy = { ...def };
    this.#defined.set(def.id, copy);
    this.#listeners.forEach((fn) => fn());
    return () => {
      if (this.#defined.get(def.id) !== copy) return;
      this.#defined.delete(def.id);
      this.#listeners.forEach((fn) => fn());
    };
  }

  #away = (page: string | undefined): boolean => page !== undefined && page !== this.current();

  get: TargetSource["get"] = (id) => {
    const def = this.#defined.get(id);
    const el = def?.element ?? (def?.selector !== undefined ? document.querySelector(def.selector) : null);
    if (def && (def.selector !== undefined || def.element)) {
      if (this.#away(def.page)) return undefined;
      return el?.isConnected ? { element: el, reveal: def.reveal, description: def.description, label: def.label } : undefined;
    }
    const dom: Found | null | undefined = this.#dom().get(id);
    if (!dom || this.#away(dom.page)) return undefined;
    return def ? { ...dom, description: dom.description ?? def.description, label: dom.label ?? def.label, reveal: dom.reveal ?? def.reveal } : dom;
  };

  ids(): string[] {
    const dom = this.#dom();
    return [...new Set([...this.#defined.keys(), ...dom.ids()])].filter((id) => !this.offPage(id));
  }

  /** The off-page entry for `id`, if that is what it is. */
  offPage(id: string): OffPage | undefined {
    const def = this.#defined.get(id);
    if (def?.page !== undefined && this.#away(def.page)) return { id, page: def.page, label: def.label, description: def.description };
    const dom = def ? undefined : this.#dom().get(id);
    if (dom?.page !== undefined && this.#away(dom.page)) return { id, page: dom.page, label: dom.label, description: dom.description };
  }

  /** Every off-page target, defined ones first. */
  allOffPage(): OffPage[] {
    const ids = new Set([...this.#defined.keys(), ...this.#dom().ids()]);
    return [...ids].flatMap((id) => this.offPage(id) ?? []);
  }
}
