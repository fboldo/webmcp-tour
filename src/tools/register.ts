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
 * distinct (`createTour({ toolPrefix })` or `{ names }`).
 * All or nothing: if any tool cannot be registered (a duplicate name, a browser refusal), the ones that did register
 * are unregistered and the returned promise **rejects**. It is `async`, so it never throws synchronously: `await` it
 * or add a `.catch`. Where WebMCP is unavailable it resolves to a no-op registration with one `console.info`.
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
    } catch (e) {
      own.delete(ctl);
      if (!ctl.signal.aborted) throw e;
      return;
    }
    if (stopped) {
      own.delete(ctl);
      ctl.abort(); // stopped mid-registration: unregister what just landed
    }
  };
  // All or nothing for this call: the tools register together, and if the browser refuses any of them
  // (a duplicate name from another copy of the library, say) the ones that succeeded are unregistered.
  const results = await Promise.allSettled(defs.map(register));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    unregister();
    throw failed.reason;
  }
  return { unregister };
}
