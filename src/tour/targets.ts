import { domTargets } from "../engine/resolver/index.js";
import type { TargetSource } from "../engine/resolver/index.js";
import type { TargetDefinition } from "./types.js";


/** `defineTarget` registry layered over `[data-tour-id]`; defined targets win. */
export class Targets implements TargetSource {
  readonly #defined = new Map<string, TargetDefinition>();
  readonly #listeners = new Set<() => void>();

  /** Called after `defineTarget` adds or removes a definition (DOM targets are read at call time). */
  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  define(def: TargetDefinition): () => void {
    if (!def || typeof def.id !== "string" || !def.id.trim()) throw new TypeError("webmcp-tour: defineTarget needs a non-empty `id`");
    if ((def.selector === undefined) === (def.element === undefined))
      throw new TypeError("webmcp-tour: defineTarget needs exactly one of `selector` or `element`");
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

  get: TargetSource["get"] = (id) => {
    const def = this.#defined.get(id);
    if (def) {
      const element = def.element ?? document.querySelector(def.selector!);
      return element?.isConnected ? { element, reveal: def.reveal, description: def.description, label: def.label } : undefined;
    }
    return domTargets(document).get(id);
  };

  ids(): string[] {
    return [...new Set([...this.#defined.keys(), ...domTargets(document).ids()])];
  }
}
