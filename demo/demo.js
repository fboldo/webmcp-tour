// Control panel for the demo: drives the tour by hand. tour.js sets it up (pages + SPA navigate)
// and must be imported before auto.js, which registers the WebMCP tools on that same tour.
import { tour } from "./tour.js";
import "/dist/auto.js";

const result = document.getElementById("result");
const form = document.getElementById("step");
const show = (envelope) => (result.textContent = JSON.stringify(envelope, null, 2));

// A target declared in code instead of with data attributes.
tour.defineTarget({
  id: "help-chat",
  selector: "#help",
  description: "Opens the support chat. Replies usually come within a few minutes.",
});

async function run(step) {
  show(await tour.show(step));
}

// One button per declared target, on any page.
const box = document.getElementById("targets");
const ids = new Set([...document.querySelectorAll("[data-tour-id]")].map((el) => el.getAttribute("data-tour-id")));
for (const id of ids) {
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
  if (!step.message && !("target" in step) && !("page" in step)) step.message = "This is the control you are looking for."; // only declared targets have a default
  if (f.get("index") !== "") step.index = Number(f.get("index"));
  run(step);
});
document.getElementById("dismiss").addEventListener("click", () => show(tour.dismiss()));
tour.on("dismiss", (e) => console.info("dismissed:", e.reason));
