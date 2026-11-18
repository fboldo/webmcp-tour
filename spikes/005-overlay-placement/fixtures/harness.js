// Loaded as an external module (CSP allows only 'self' scripts).
import { createOverlay, supportsAnchor } from "/src/overlay.js";

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) =>
  window.__violations.push({ directive: e.effectiveDirective, sample: e.sample, blocked: e.blockedURI }),
);

const q = new URLSearchParams(location.search);
window.spike = {
  supportsAnchor: supportsAnchor(),
  overlay: createOverlay({
    positioning: q.get("positioning") ?? "auto",
    isolation: q.get("isolation") ?? "shadow",
  }),
};
document.documentElement.dataset.ready = "1";

if (q.get("hostile")) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "/fixtures/hostile.css";
  document.head.append(l);
}
