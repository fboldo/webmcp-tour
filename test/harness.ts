// Loaded by the fixture page as an external module (CSP allows only 'self').
import { Overlay } from "../src/engine/overlay/index.js";

declare global {
  interface Window {
    overlay: Overlay;
    violations: { directive: string; sample: string }[];
  }
}

window.violations = [];
document.addEventListener("securitypolicyviolation", (e) =>
  window.violations.push({ directive: e.effectiveDirective, sample: e.sample }),
);

const q = new URLSearchParams(location.search);
const positioning = q.get("positioning");
const hook = q.get("hook");
const attribution = q.get("attribution");
const describeTarget = q.has("describe");
window.overlay = new Overlay({
  ...(q.has("headless") ? { render: false } : {}),
  ...(positioning === "anchor" || positioning === "fixed" ? { positioning } : {}),
  ...(attribution ? { attribution } : {}),
  ...(describeTarget ? { describeTarget } : {}),
  ...(hook === "throw"
    ? {
        renderPopover: () => {
          throw new Error("bad hook");
        },
      }
    : hook
      ? {
          renderPopover: (step) => {
            const el = document.createElement("section");
            el.id = "custom";
            el.textContent = `${step.title} / ${step.message}`;
            const close = document.createElement("button");
            close.setAttribute("part", "close");
            close.textContent = "x";
            el.append(close);
            return el;
          },
        }
      : {}),
});
if (q.has("hostile")) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "/fx/hostile.css";
  l.onload = () => (document.documentElement.dataset["ready"] = "1");
  document.head.append(l);
} else document.documentElement.dataset["ready"] = "1";
