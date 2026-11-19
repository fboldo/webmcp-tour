// Script-tag build: a default tour, registered as WebMCP tools, exposed as `window.webmcpTour`.
import { createTour } from "./tour/index.js";
import type { Tour, TourOptions } from "./tour/index.js";
import { registerAsWebMcpTool } from "./tools/index.js";

// Options for the default tour come from the loader's `data-config`: the id of exactly one
// `<script type="application/json">`, or inline JSON when the value starts with "{".
// Only JSON-safe options are read (`navigate` is a function: use `data-manual` and call `createTour` yourself).
// `window.webmcpTour` is page-global, so any same-origin script can drive the overlay; opt out with
// `<script data-no-global src="…">`. `data-manual` skips the default tool registration.
// All of this needs `document.currentScript`, which is null when the file is not run as a classic script
// (for example bundled as a module): then there is no config and no data-* flag.
const JSON_OPTIONS = ["pages", "labels", "pageSuggestion", "resume", "takeMeThere"] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function config(script: Element | null): TourOptions {
  const ref = script?.getAttribute("data-config")?.trim();
  const out: Record<string, unknown> = {};
  if (!ref) return out;
  try {
    let text = ref;
    if (!ref.startsWith("{")) {
      const hits = document.querySelectorAll(`script[type="application/json"]#${CSS.escape(ref)}`);
      if (hits.length !== 1) throw 0;
      text = hits[0]!.textContent!;
    }
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw)) throw 0;
    for (const k of JSON_OPTIONS) if (Object.hasOwn(raw, k)) out[k] = raw[k];
    const { labels = {}, pages = [] } = out;
    if (!isObject(labels) || Object.values(labels).some((v) => typeof v !== "string") || !Array.isArray(pages) || !pages.every(isObject)) throw 0;
  } catch {
    console.warn(`webmcp-tour: data-config "${ref}" is missing, duplicated or invalid; using defaults`);
    return {};
  }
  return out as TourOptions;
}

if (typeof document !== "undefined") {
  const script = document.currentScript;
  const w = window as unknown as { webmcpTour?: unknown };
  if (w.webmcpTour) console.warn("webmcp-tour: already loaded");
  else {
    const tour: Tour = createTour(config(script));
    if (!script?.hasAttribute("data-no-global")) w.webmcpTour = { tour, createTour, registerAsWebMcpTool };
    if (!script?.hasAttribute("data-manual")) void registerAsWebMcpTool(tour);
  }
}
