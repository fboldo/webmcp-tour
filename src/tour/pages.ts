import type { PageDefinition } from "./types.js";

const trail = (p: string): string => p.replace(/\/+$/, "") || "/";
const pathOf = (url: string): string => {
  try {
    return trail(new URL(url, location.href).pathname);
  } catch {
    return url;
  }
};

/** The pages the app declared. The current one is whichever matches `location`, checked at call time. */
export class Pages {
  readonly #all = new Map<string, PageDefinition>();
  readonly #listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  define(def: PageDefinition): () => void {
    const m = def?.match;
    if (!["id", "url", "title"].every((k) => typeof def?.[k as "id"] === "string" && def[k as "id"].trim()) || (m !== undefined && !["string", "function"].includes(typeof m) && !(m instanceof RegExp)))
      throw new TypeError("webmcp-tour: a page needs non-empty `id`, `url` and `title`, and `match` as a string, RegExp or function");
    const copy = { ...def };
    this.#all.set(def.id, copy);
    this.#listeners.forEach((fn) => fn());
    return () => {
      if (this.#all.get(def.id) !== copy) return;
      this.#all.delete(def.id);
      this.#listeners.forEach((fn) => fn());
    };
  }

  get = (id: string): PageDefinition | undefined => this.#all.get(id);

  all = (): PageDefinition[] => [...this.#all.values()];

  /** The first page whose `match` accepts `location`. Default: the page's URL path equals `location.pathname`. */
  current(): PageDefinition | undefined {
    const { pathname } = location;
    return this.all().find(({ match, url }) => {
      try {
        if (match === undefined) return pathOf(url) === trail(pathname);
        if (typeof match === "string") return pathname.startsWith(match);
        if (match instanceof RegExp) return ((match.lastIndex = 0), match.test(pathname));
        return !!match(location);
      } catch {
        return false; // a broken matcher is not a match
      }
    });
  }
}
