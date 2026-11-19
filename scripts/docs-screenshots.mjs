// Captures the docs' demo screenshots into site/content/images/ by driving the demo with its scripted agent.
//   pnpm build && node scripts/docs-screenshots.mjs        (needs Playwright's Chromium: pnpm exec playwright install chromium)
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("../site/content/images/", import.meta.url));
const port = 4199;
const url = (path) => `http://127.0.0.1:${port}/demo/${path}?agent=scripted&panel=closed`;
const MAX = 200 * 1024;

await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ["scripts/serve-demo.mjs"], { cwd: repo, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
for (let i = 0; ; i++) {
  try {
    if ((await fetch(url("billing"))).ok) break;
  } catch {}
  if (i > 50) throw new Error("demo server did not start");
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 720 }, deviceScaleFactor: 1 });
  const shot = async (name) => {
    await page.waitForTimeout(400); // transitions settle
    const file = `${out}${name}.png`;
    await page.screenshot({ path: file });
    const { size } = await stat(file);
    console.log(`${name}.png ${(size / 1024).toFixed(0)} KB`);
    if (size > MAX) throw new Error(`${name}.png is over 200 KB`);
  };
  const ask = async (q) => {
    await page.fill("#q", q);
    await page.press("#q", "Enter");
  };
  const card = () => page.locator("[part~=popover]:popover-open");

  // 1. Highlight + card.
  await page.goto(url("billing"));
  await ask("How do I change my plan?");
  await card().waitFor();
  await shot("highlight-card");

  // 2. A control on another page: the centred suggestion.
  await page.evaluate(() => window.webmcpTour.dismiss());
  await ask("Where do I set up two-factor?");
  await page.getByRole("button", { name: "Go to Security" }).waitFor();
  await shot("other-page");

  // 3. Go: the step resumes on Security.
  await page.getByRole("button", { name: "Go to Security" }).click();
  await page.waitForURL(/security/);
  await page.getByRole("button", { name: "Got it" }).waitFor();
  await shot("resume-landing");

  // 4. The plan picker (a modal dialog): point at Confirm.
  await page.evaluate(() => window.webmcpTour.dismiss());
  await page.goto(url("billing"));
  await page.getByRole("button", { name: "Change plan" }).click();
  await page.evaluate(() => window.webmcpTour.show({ target: "plan-confirm", message: "Press Confirm to switch to the plan you picked." }));
  await card().waitFor();
  await shot("plan-picker");

  // 5. Forced colors.
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(url("billing"));
  await ask("How do I change my plan?");
  await card().waitFor();
  await shot("forced-colors");
} finally {
  await browser.close();
  server.kill();
}
