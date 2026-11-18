import "../../shared/app.css";
import { routes } from "./routes";

// ?polyfill: install the W3C WebMCP polyfill before the tour registers its tools.
if (location.search.includes("polyfill")) {
  await import("@w3c/webmcp-polyfill/auto");
  await import("../../shared/tool-console.js");
}

// One line: registers tour_show_step, tour_dismiss, tour_wait_for_interaction, and
// tour_list_targets for as long as the current route declares targets.
await import("webmcp-tour/auto");

const view = document.getElementById("view")!;

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
