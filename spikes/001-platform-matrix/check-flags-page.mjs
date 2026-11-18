// Checks that the chrome://flags entry "enable-webmcp-testing" (what a human toggles) turns on the
// same API as --enable-features=WebMCP, by seeding Local State the way chrome://flags does.
import { chromium } from "playwright-core";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "flags-"));
await writeFile(join(dir, "Local State"), JSON.stringify({ browser: { enabled_labs_experiments: ["enable-webmcp-testing@1"] } }));
const ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true });
const page = await ctx.newPage();
await page.goto("http://localhost:8401/?host=chrome-flags-page");
await page.waitForTimeout(1000);
const log = await page.evaluate(() => window.__spike.log.map(({ event, documentModelContext, navigatorModelContext }) => ({ event, documentModelContext, navigatorModelContext })));
console.log(JSON.stringify({ version: ctx.browser()?.version(), seededFlag: "enable-webmcp-testing@1", log }, null, 1));
await ctx.close();
