import { getModelContext } from "../adapters/index.js";
import type { Tour } from "../tour/index.js";
import type { ToolDefinition } from "./definitions.js";

export interface RegisterOptions {
  /** Aborting unregisters every tool this call registered. */
  signal?: AbortSignal;
}

export interface Registration {
  /** Unregister every tool this call registered. Idempotent. */
  unregister(): void;
}

/**
 * Register the tour's four tools on the page's model context. For several tours every tool name must be
 * distinct (`createTour({ toolPrefix })` or `{ names }`); a duplicate throws before anything registers.
 * Where WebMCP is unavailable it is a no-op with one `console.info`. A tool the browser refuses is skipped with a warning.
 * There are no unload listeners (they would cost bfcache).
 */
export async function registerAsWebMcpTool(tours: Tour | Tour[], options: RegisterOptions = {}): Promise<Registration> {
  const defs = (Array.isArray(tours) ? tours : [tours]).flatMap((t) => t.tools());
  const seen = new Set<string>();
  for (const { name } of defs) {
    if (seen.has(name)) throw new TypeError(`webmcp-tour: more than one tool is named "${name}"; give each tour a toolPrefix or names`);
    seen.add(name);
  }
  const mc = getModelContext();
  const own = new Set<AbortController>();
  const { signal } = options;
  let stopped = !mc || !!signal?.aborted;
  const unregister = (): void => {
    stopped = true;
    for (const c of own) c.abort();
    own.clear();
  };
  if (stopped) return { unregister };
  signal?.addEventListener("abort", unregister, { once: true });

  const register = async (def: ToolDefinition): Promise<void> => {
    const ctl = new AbortController();
    own.add(ctl);
    try {
      await mc!.registerTool(def, { signal: ctl.signal });
      if (!stopped) return;
    } catch (e) {
      if (!ctl.signal.aborted) console.warn(`webmcp-tour: could not register "${def.name}" (${(e as Error)?.name}); skipped.`);
    }
    own.delete(ctl);
    ctl.abort(); // no-op unless stopped mid-registration, when it unregisters
  };
  // Started together, in order: an agent that lists the tools sees all of them or none.
  await Promise.all(defs.map(register));
  return { unregister };
}
