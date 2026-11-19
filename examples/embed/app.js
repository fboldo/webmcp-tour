// Engine embed: one app tool of our own plus the tour tools under our own names.
import { createTour, getModelContext, registerAsWebMcpTool } from "/dist/index.js";

const PLANS = { starter: "Starter", team: "Team", business: "Business" };
const $ = (id) => document.getElementById(id);
const tour = createTour({
  labels: { attribution: "From Northwind assistant" },
  // The tour tools under our own names.
  names: {
    showStep: "settings_point_at",
    listTargets: "settings_list_controls",
    dismiss: "settings_clear_point",
    waitForInteraction: "settings_wait_for_click",
  },
});
let pending = null;

function stage(plan) {
  pending = plan;
  $("summary").textContent = `Switch from ${$("current").textContent} to ${PLANS[plan]}.`;
  $("review").hidden = false;
}
const clear = () => {
  pending = null;
  $("review").hidden = true;
  tour.dismiss();
};
$("confirm").addEventListener("click", () => {
  $("current").textContent = PLANS[pending];
  clear();
});
$("cancel").addEventListener("click", clear);

const mc = getModelContext(); // null (with one console.info) where WebMCP is missing
if (mc) {
  // Your own tool: the app logic runs, then the tour points the user at the one click that matters.
  await mc.registerTool({
    name: "change_plan",
    description: "Stage a switch of the workspace subscription to starter, team or business. Nothing changes until the user confirms; the confirm button is highlighted for them.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", enum: Object.keys(PLANS) } },
      required: ["plan"],
    },
    execute: async ({ plan }) => {
      if (!(plan in PLANS)) return { staged: false, error: `Unknown plan "${plan}".` };
      stage(plan);
      const step = await tour.show({ target: "confirm-plan", title: `Switch to ${PLANS[plan]}`, message: "Check the summary above, then confirm here." });
      return { staged: true, plan, pointed: step.ok, note: "The user still has to click Confirm." };
    },
  });
}

// The tour tools, at our own timing.
await registerAsWebMcpTool(tour);

if (window.webmcpMode === "polyfill") import("/shared/tool-console.js");
