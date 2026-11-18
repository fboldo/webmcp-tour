// The fake settings app: a tiny client-side router (Billing / Team / Security / Notifications,
// one visible at a time) plus the controls' behaviour, so multi-step guidance has real next steps.
const $ = (id) => document.getElementById(id);
const BASE = "/demo/";
const NAMES = { billing: "Billing", team: "Team", security: "Security", notifications: "Notifications" };

/** The view for a path: /demo/team -> "team"; the bare /demo/ and /demo/index.html are Billing. */
export const viewOf = (pathname) => {
  const slug = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/\.html$/, "").replace(/\/$/, "") : "";
  return slug in NAMES ? slug : "billing";
};

/** What the tour is told about the app's pages. Billing also answers to the bare /demo/. */
export const PAGES = [
  { id: "billing", url: `${BASE}billing`, title: "Billing", description: "Plan, invoices and API keys.", match: (l) => viewOf(l.pathname) === "billing" },
  { id: "team", url: `${BASE}team`, title: "Team", description: "Members and invitations." },
  { id: "security", url: `${BASE}security`, title: "Security", description: "Two-factor and account deletion." },
  { id: "notifications", url: `${BASE}notifications`, title: "Notifications", description: "Email preferences." },
];

function render() {
  const view = viewOf(location.pathname);
  for (const s of document.querySelectorAll("[data-view]")) s.hidden = s.id !== view;
  for (const a of document.querySelectorAll("nav a[data-page]")) a.toggleAttribute("aria-current", a.dataset.page === view);
  document.title = `${NAMES[view]} · Acme Cloud`;
}

/** SPA navigation: pushState and swap the visible view; nothing reloads, so the in-page agent keeps running. */
export function navigate(url) {
  history.pushState(null, "", url + location.search);
  render();
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("nav a[data-page]");
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(new URL(a.href).pathname);
});
addEventListener("popstate", render);
render();

const toast = $("toast");
let timer;
function say(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.hidden = true), 4000);
}

// Change plan -> picker (modal) -> Confirm updates the shown plan.
const plan = $("plan-dialog");
document.querySelector('[data-tour-id="billing-plan"]').addEventListener("click", () => plan.showModal());
plan.addEventListener("close", () => {
  if (plan.returnValue !== "confirm") return;
  const picked = plan.querySelector("input[name=plan]:checked");
  $("plan-name").textContent = picked.value;
  $("plan-seats").textContent = picked.dataset.seats;
  say(`Plan changed to ${picked.value}.`);
});

// Download invoices: no real file, a confirmation.
document.querySelector('[data-tour-id="invoices"]').addEventListener("click", () => say("Downloaded invoices.zip (12 PDFs)."));
document.querySelector('[data-tour-id="invite-member"]').addEventListener("click", () => say("Invite sent."));

// Security -> Advanced -> Set up two-factor -> a setup step.
const tfa = $("tfa-dialog");
document.querySelector('[data-tour-id="two-factor"]').addEventListener("click", () => tfa.showModal());
tfa.addEventListener("close", () => {
  if (tfa.returnValue === "verify") say("Two-factor is on.");
});

// Help -> a fake chat (non-modal, so the page stays usable).
const chat = $("chat");
const log = $("chat-log");
const reply = (who, text) => {
  const li = document.createElement("li");
  li.textContent = `${who}: ${text}`;
  log.append(li);
};
$("help").addEventListener("click", () => chat.show());
$("chat-close").addEventListener("click", () => chat.close());
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chat-msg");
  reply("You", input.value);
  input.value = "";
  setTimeout(() => reply("Support", "Thanks! An agent will reply within a few minutes."), 600);
});
