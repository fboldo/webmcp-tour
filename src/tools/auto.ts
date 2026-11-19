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

type Slot = { [KEY]?: AutoHandle };

/**
 * Register the tour tools on the page's model context. One registration per
 * document: a second call (a script tag plus a bundle) returns the first handle.
 * No-op, with one `console.info`, where WebMCP is unavailable. Never throws.
 *
 * All four tools register at once: `tour_list_targets` is useful with zero declarations,
 * since it reports the page outline. There are no unload listeners (they would cost bfcache).
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
  let stopped = false;

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

  // Started together, in order: an agent that lists the tools sees all four or none.
  const ready = Promise.all([show, dismiss, list, wait].map(register)).then(() => {});

  const handle: AutoHandle = {
    ready,
    stop() {
      stopped = true;
      for (const c of own) c.abort();
      own.clear();
      if (slot[KEY] === handle) delete slot[KEY];
    },
  };
  slot[KEY] = handle;
  return handle;
}
