// Records the README's demo GIF: the demo's scripted agent, Billing -> "How do I set up two-factor?" ->
// centred suggestion -> Go -> resumed highlight on Security -> Got it. Writes site/content/images/demo.gif.
//   pnpm build && node scripts/readme-gif.mjs     (needs Playwright's Chromium and ffmpeg)
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("../site/content/images/demo.gif", import.meta.url));
const port = 4198;
const MAX = 3 * 1024 * 1024;
const tmp = await mkdtemp(join(tmpdir(), "readme-gif-"));

const server = spawn(process.execPath, ["scripts/serve-demo.mjs"], { cwd: repo, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/demo/billing`)).ok) break;
    } catch {}
    if (i > 50) throw new Error("demo server did not start");
    await new Promise((r) => setTimeout(r, 100));
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1240, height: 720 }, recordVideo: { dir: tmp, size: { width: 1240, height: 720 } } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/demo/billing?agent=scripted`);
  await page.waitForTimeout(1200);
  await page.locator("#q").pressSequentially("How do I set up two-factor?", { delay: 45 });
  await page.waitForTimeout(400);
  await page.press("#q", "Enter");
  const go = page.getByRole("button", { name: "Go to Security" });
  await go.waitFor();
  await page.waitForTimeout(2000);
  await go.click();
  const gotIt = page.getByRole("button", { name: "Got it" });
  await gotIt.waitFor();
  await page.waitForTimeout(2200);
  await gotIt.click();
  await page.waitForTimeout(1200);
  await context.close(); // flushes the video
  await browser.close();

  const webm = join(tmp, (await readdir(tmp)).find((f) => f.endsWith(".webm")));
  const filters = "fps=12,scale=900:-1:flags=lanczos";
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", "0.4", "-i", webm, "-vf", `${filters},split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, "-loop", "0", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
  const { size } = await stat(out);
  console.log(`demo.gif ${(size / 1024).toFixed(0)} KB`);
  if (size > MAX) throw new Error("demo.gif is over 3 MB");
} finally {
  server.kill();
  await rm(tmp, { recursive: true, force: true });
}
