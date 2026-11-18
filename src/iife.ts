// Script-tag build: registers the tools, exposes `window.webmcpTour`.
import { createTour } from "./tour/index.js";
import { registerAutoTools } from "./tools/index.js";

// `window.webmcpTour` is the tour instance. It is page-global, so any
// same-origin script can drive the overlay; opt out with
// `<script data-no-global src="…">`. The instance stays reachable through the
// `Symbol.for("webmcp-tour")` singleton either way. `data-no-auto` skips tool
// registration (embed the factories yourself with `tour.tools()`).
if (typeof document !== "undefined") {
  const tour = createTour();
  const script = document.currentScript;
  if (!script?.hasAttribute("data-no-global")) (window as unknown as { webmcpTour: unknown }).webmcpTour = tour;
  if (!script?.hasAttribute("data-no-auto")) registerAutoTools();
}
