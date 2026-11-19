// Runs in a Worker, which has no `document`: the nearest thing to a server render.
import { createTour } from "../src/index.js";

try {
  const tour = createTour();
  const off = tour.defineTarget({ id: "plan", selector: "#plan" });
  const result = { targets: tour.targets().targets, outline: tour.outline() };
  off();
  postMessage({ ok: true, hasDocument: typeof document !== "undefined", ...result });
} catch (e) {
  postMessage({ ok: false, error: String(e) });
}
