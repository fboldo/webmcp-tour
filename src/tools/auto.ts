import { getModelContext } from "../adapters/index.js";
import type { ModelContextLike } from "../adapters/index.js";
import { createTour } from "../tour/index.js";
import type { Tour } from "../tour/index.js";
import { defineTools } from "./definitions.js";
import type { ToolDefinition, ToolNames } from "./definitions.js";

export interface AutoOptions {
  /** Register under your own names. Applies to the call that creates the registration. */
  names?: Partial<ToolNames>;
}

export interface AutoHandle {
  /** Settles once the initial registrations have. Never rejects. */
  ready: Promise<void>;
  /** Unregister every tool (aborts each registration's signal), stop watching for targets, release the singleton. */
  stop(): void;
}

const KEY = Symbol.for("webmcp-tour.auto");
const SETTLE_MS = 200;

type Slot = { [KEY]?: AutoHandle };

/**
 * Register the tour tools on the page's model context. One registration per
 * document: a second call (a script tag plus a bundle) returns the first handle.
 * No-op, with one `console.info`, where WebMCP is unavailable. Never throws.
 *
 * `tour_list_targets` is registered only while declared targets or pages exist. A
 * `defineTarget` call, or any DOM mutation followed by 200 ms of quiet,
 * re-checks. There are no unload listeners (they would cost bfcache).
 */
export function registerAutoTools(options: AutoOptions = {}): AutoHandle {
  const slot = globalThis as Slot;
  if (slot[KEY]) return slot[KEY];
  const none: AutoHandle = { ready: Promise.resolve(), stop() {} };
  const mc = typeof document === "undefined" ? null : getModelContext();
  if (!mc) return none;

  const tour = createTour();
  const [show, list, dismiss, wait] = defineTools(tour, options.names) as [ToolDefinition, ToolDefinition, ToolDefinition, ToolDefinition];
  const own = new Set<AbortController>();
  let listing: AbortController | undefined;
  let blocked = false; // the list tool's name is taken: don't retry on every change
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const register = async (def: ToolDefinition): Promise<AbortController | undefined> => {
    if (stopped) return;
    const ctl = new AbortController();
    own.add(ctl);
    try {
      await (mc as ModelContextLike).registerTool(def, { signal: ctl.signal });
      if (!stopped) return ctl;
    } catch (e) {
      if (!ctl.signal.aborted) console.warn(`webmcp-tour: could not register "${def.name}" (${(e as Error)?.name}); skipped.`);
    }
    own.delete(ctl);
    ctl.abort(); // no-op unless stopped mid-registration, when it unregisters
  };

  const sync = async (): Promise<void> => {
    if (stopped || blocked) return;
    const { total, page, pages } = tour.targets();
    const want = total > 0 || !!page || !!pages;
    if (want && !listing) {
      listing = await register(list);
      blocked = !listing;
    } else if (!want && listing) {
      listing.abort();
      own.delete(listing);
      listing = undefined;
    }
  };
  // Registrations run one at a time, so a change during the first pass cannot register a tool twice.
  const ready = (async () => {
    await register(show);
    await register(dismiss);
    await register(wait);
  })().then(sync);
  let chain = ready;
  const queue = () => void (chain = chain.then(sync));

  const handle: AutoHandle = {
    ready,
    stop() {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
      off();
      for (const c of own) c.abort();
      own.clear();
      if (slot[KEY] === handle) delete slot[KEY];
    },
  };
  slot[KEY] = handle;

  const off = tour.on("targets", queue);
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(queue, SETTLE_MS);
  });
  observer.observe(document, { childList: true, subtree: true, attributeFilter: ["data-tour-id"] });
  return handle;
}
