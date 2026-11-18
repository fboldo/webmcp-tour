// Tab switching only. Nothing here knows about the tour: the library works from the markup.
const tabs = [...document.querySelectorAll("[role=tab]")];
function select(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
}
for (const t of tabs) t.addEventListener("click", () => select(t));
