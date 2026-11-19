import "../../shared/app.css";
import { createTour, registerAsWebMcpTool } from "webmcp-tour";
import { routes } from "./routes";
import "../../shared/webmcp-env.js";

// Native WebMCP when the browser has it, else the W3C polyfill (override: ?webmcp=native|polyfill).
const env = (window as unknown as { webmcpEnv: { detect(): { mode: string; load: boolean; status: string }; render(e: object): void } }).webmcpEnv;
const detected = env.detect();
if (detected.load) await import("@w3c/webmcp-polyfill/auto");
env.render(detected);
if (detected.mode === "polyfill") await import("../../shared/tool-console.js");

const view = document.getElementById("view")!;

// Pages let the agent say "that control is on another page": the user gets a card with
// Go / Not now, and Go calls navigate(), here the SPA router, so the agent survives.
function go(url: string): void {
  const u = new URL(url, location.href); // carries the tour's resume nonce; keep it, add our own params
  for (const [k, v] of new URLSearchParams(location.search)) if (!u.searchParams.has(k)) u.searchParams.append(k, v);
  history.pushState(null, "", u.pathname + u.search + u.hash);
  render();
}
const tour = createTour({
  navigate: go,
  pages: [
    { id: "dashboard", url: "/", title: "Dashboard" },
    { id: "projects", url: "/projects", title: "Projects" },
    { id: "settings", url: "/settings", title: "Settings", description: "API tokens, notification preferences." },
  ],
});
// A target declared for its page: no element needed while the user is elsewhere. On its own
// page the data-tour-id element below supplies the element and this supplies the fallback text.
tour.defineTarget({ id: "new-project", page: "projects", label: "New project", description: "Creates an empty project." });
tour.defineTarget({ id: "api-token", page: "settings", label: "Create API token", description: "Creates a personal API token." });
tour.defineTarget({ id: "email-digest", page: "settings", label: "Daily email digest", description: "One summary email a day." });

// registers tour_show_step, tour_dismiss, tour_wait_for_interaction and tour_list_targets.
await registerAsWebMcpTool(tour);

function render(): void {
  const path = location.pathname.replace(/\/$/, "") || "/";
  const route = routes[path] ?? routes["/"]!;
  view.innerHTML = route();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-link]")) {
    if (a.pathname === path) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  document.title = `Northwind · ${path === "/" ? "Dashboard" : path.slice(1)}`;
}

document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>("a[data-link]");
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  history.pushState(null, "", a.pathname + location.search);
  render();
});
addEventListener("popstate", render);
render();
