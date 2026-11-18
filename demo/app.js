// The fake settings app's behaviour: small, so multi-step guidance has real next steps.
const $ = (id) => document.getElementById(id);
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
