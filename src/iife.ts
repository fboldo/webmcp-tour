// Script-tag build. Auto-registration lands in M2 (via ./auto.js).
import "./auto.js";
import { createTour } from "./tour/index.js";

// `window.webmcpTour` is the tour instance. It is page-global, so any
// same-origin script can drive the overlay; opt out with
// `<script data-no-global src="…">`. The instance stays reachable through the
// `Symbol.for("webmcp-tour")` singleton either way.
if (typeof document !== "undefined") {
  const tour = createTour();
  if (!document.currentScript?.hasAttribute("data-no-global")) (window as unknown as { webmcpTour: unknown }).webmcpTour = tour;
}
