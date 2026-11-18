// Control panel for the demo: drives window.webmcpTour (the IIFE build).
const tour = window.webmcpTour;
const result = document.getElementById("result");
const form = document.getElementById("step");
const show = (envelope) => (result.textContent = JSON.stringify(envelope, null, 2));

if (!tour) {
  show({ error: "window.webmcpTour is missing: run `pnpm demo` (it builds first) and load this page from it." });
  throw new Error("webmcpTour not loaded");
}

// A target declared in code instead of with data attributes.
tour.defineTarget({
  id: "help-chat",
  selector: "#help",
  description: "Opens the support chat. Replies usually come within a few minutes.",
});

async function run(step) {
  show(await tour.show(step));
}

// One button per declared target.
const box = document.getElementById("targets");
for (const el of document.querySelectorAll("[data-tour-id]")) {
  const id = el.getAttribute("data-tour-id");
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = id;
  b.addEventListener("click", () => run({ target: id }));
  box.append(b);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(form);
  const step = { [f.get("by")]: f.get("value") };
  for (const k of ["title", "message", "placement"]) if (f.get(k)) step[k] = f.get(k);
  if (!step.message && !("target" in step)) step.message = "This is the control you are looking for."; // only declared targets have a default
  if (f.get("index") !== "") step.index = Number(f.get("index"));
  run(step);
});
document.getElementById("dismiss").addEventListener("click", () => show(tour.dismiss()));
tour.on("dismiss", (e) => console.info("dismissed:", e.reason));
