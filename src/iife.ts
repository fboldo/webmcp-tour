// Script-tag build: a default tour, registered as WebMCP tools, exposed as `window.webmcpTour`.
import { createTour } from "./tour/index.js";
import type { Tour, TourOptions } from "./tour/index.js";
import { registerAsWebMcpTool } from "./tools/index.js";

// Options for the default tour come from `<script type="application/json" id="webmcp-tour-config">`.
// Only JSON-safe options are read (`navigate` is a function: use `data-manual` and call `createTour` yourself).
// `window.webmcpTour` is page-global, so any same-origin script can drive the overlay; opt out with
// `<script data-no-global src="…">`. `data-manual` skips the default tool registration.
// Only a JSON script block counts: a same-id element inside user content is not configuration.
const CONFIG = 'script[type="application/json"]#webmcp-tour-config';
const JSON_OPTIONS = ["pages", "labels", "pageSuggestion", "resume", "takeMeThere"] as const;

function config(): TourOptions {
  const out: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(document.querySelector(CONFIG)?.textContent || "{}") as Record<string, unknown>;
    for (const k of JSON_OPTIONS) if (raw[k] !== undefined) out[k] = raw[k];
  } catch {
    console.warn("webmcp-tour: invalid #webmcp-tour-config");
  }
  return out as TourOptions;
}

if (typeof document !== "undefined") {
  const script = document.currentScript;
  const tour: Tour = createTour(config());
  if (!script?.hasAttribute("data-no-global")) (window as unknown as { webmcpTour: unknown }).webmcpTour = { tour, createTour, registerAsWebMcpTool };
  if (!script?.hasAttribute("data-manual")) void registerAsWebMcpTool(tour);
}
