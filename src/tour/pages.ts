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
  readonly #customNavigate: boolean;

  /** `customNavigate`: the app supplies `navigate`, so it owns where cross-origin pages lead. */
  constructor(customNavigate = false) {
    this.#customNavigate = customNavigate;
  }

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  define(def: PageDefinition): () => void {
    const m = def?.match;
    if (!["id", "url", "title"].every((k) => typeof def?.[k as "id"] === "string" && def[k as "id"].trim()) || (m !== undefined && !["string", "function"].includes(typeof m) && !(m instanceof RegExp)))
      throw new TypeError("webmcp-tour: a page needs non-empty `id`, `url` and `title`, and `match` as a string, RegExp or function");
    this.#checkUrl(def);
    const copy = { ...def };
    this.#all.set(def.id, copy);
    this.#listeners.forEach((fn) => fn());
    return () => {
      if (this.#all.get(def.id) !== copy) return;
      this.#all.delete(def.id);
      this.#listeners.forEach((fn) => fn());
    };
  }

  /** Go navigates to `url`: only http(s), and the page's own origin unless the app opted out. */
  #checkUrl({ url, allowCrossOrigin }: PageDefinition): void {
    let u: URL;
    try {
      u = new URL(url, typeof location === "undefined" ? undefined : location.href);
    } catch {
      throw new TypeError(`webmcp-tour: page url "${url}" is not a valid URL`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new TypeError("webmcp-tour: a page url must be http(s) or relative");
    if (typeof location !== "undefined" && u.origin !== location.origin && !allowCrossOrigin && !this.#customNavigate)
      throw new TypeError(`webmcp-tour: page url "${url}" is on another origin; set allowCrossOrigin: true or pass \`navigate\``);
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
