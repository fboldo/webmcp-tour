// Labelling aid: screenshot a fixture and dump its visible interactive
// elements (tag, role-ish, visible text, aria-label, a unique-ish selector).
// Usage: node inspect.mjs <name> [--shot]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { openFixture, contextOptions } from "./fixture-server.mjs";

const [name, ...flags] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext(contextOptions);
const page = await openFixture(ctx, name);
if (flags.includes("--shot")) {
  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  await page.screenshot({ path: `out/${name}.png`, fullPage: false });
}
const rows = await page.evaluate(() => {
  const out = [];
  const walk = (root, host) => {
    for (const el of root.querySelectorAll("a[href],button,input,select,textarea,summary,[role],[tabindex],label,[aria-label]")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const text = (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 50);
      out.push([host ? host + " >>> " : "", el.tagName.toLowerCase(), el.getAttribute("role") || "", el.id ? "#" + el.id : "", JSON.stringify(text), el.getAttribute("aria-label") ? "aria=" + JSON.stringify(el.getAttribute("aria-label")) : "", Math.round(r.x) + "," + Math.round(r.y)].join(" "));
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot, el.tagName.toLowerCase());
  };
  walk(document, "");
  return out;
});
console.log(rows.join("\n"));
await browser.close();
