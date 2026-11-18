import { domTargets } from "../engine/resolver/index.js";
import type { TargetSource } from "../engine/resolver/index.js";
import type { TargetDefinition } from "./types.js";

export interface Declared {
  element: Element;
  reveal?: string | undefined;
  description?: string | undefined;
}

/** `defineTarget` registry layered over `[data-tour-id]`; defined targets win. */
export class Targets implements TargetSource {
  readonly #defined = new Map<string, TargetDefinition>();

  define(def: TargetDefinition): () => void {
    if (!def || typeof def.id !== "string" || !def.id.trim()) throw new TypeError("webmcp-tour: defineTarget needs a non-empty `id`");
    if ((def.selector === undefined) === (def.element === undefined))
      throw new TypeError("webmcp-tour: defineTarget needs exactly one of `selector` or `element`");
    if (def.selector !== undefined) document.createDocumentFragment().querySelector(def.selector); // throws SyntaxError when invalid
    const copy = { ...def };
    this.#defined.set(def.id, copy);
    return () => void (this.#defined.get(def.id) === copy && this.#defined.delete(def.id));
  }

  get(id: string): Declared | undefined {
    const def = this.#defined.get(id);
    if (def) {
      const element = def.element ?? document.querySelector(def.selector!);
      return element?.isConnected ? { element, reveal: def.reveal, description: def.description } : undefined;
    }
    const hit = domTargets(document).get(id);
    return hit ? { element: hit.element, reveal: hit.reveal, description: hit.element.getAttribute("data-tour-description") ?? undefined } : undefined;
  }

  ids(): string[] {
    return [...new Set([...this.#defined.keys(), ...domTargets(document).ids()])];
  }
}
