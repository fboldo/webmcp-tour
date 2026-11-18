// Capture static, offline-reproducible snapshots of public pages.
// Usage: node capture.mjs [name ...]   (no args = all pages in pages.json)
//
// The snapshot is the rendered DOM (open shadow roots serialized as
// declarative shadow DOM), scripts removed, stylesheets inlined and pruned
// to rules that match something, images replaced by same-size placeholders.
// Fixtures are written gzipped to fixtures/<name>.html.gz.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const pages = JSON.parse(readFileSync(new URL("./pages.json", import.meta.url)));
const only = process.argv.slice(2);
mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });

const browser = await chromium.launch();
for (const p of pages) {
  if (only.length && !only.includes(p.name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    colorScheme: "light",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    for (const step of p.setup ?? []) {
      if (step.click) await page.locator(step.click).first().click({ timeout: 5000 }).catch((e) => console.warn(p.name, "setup click failed", step.click, e.message));
      if (step.wait) await page.waitForTimeout(step.wait);
    }
    await page.waitForTimeout(p.settle ?? 1500);
    // Cross-origin stylesheets without CORS are unreadable in the page:
    // fetch their text here and hand it in.
    const hrefs = await page.evaluate(() =>
      [...document.styleSheets].filter((s) => { try { s.cssRules; return false; } catch { return !!s.href; } }).map((s) => s.href),
    );
    const external = {};
    for (const href of hrefs) {
      const res = await ctx.request.get(href).catch(() => null);
      if (res && res.ok()) external[href] = await res.text();
      else console.warn(p.name, "could not fetch", href);
    }
    const html = await page.evaluate(serialize, external);
    const gz = gzipSync(html, { level: 9 });
    writeFileSync(new URL(`./fixtures/${p.name}.html.gz`, import.meta.url), gz);
    console.log(`${p.name}: ${(html.length / 1024).toFixed(0)} KB raw, ${(gz.length / 1024).toFixed(0)} KB gz`);
  } catch (e) {
    console.error(p.name, "FAILED", e.message);
  }
  await ctx.close();
}
await browser.close();

// Runs in the page.
function serialize(external) {
  const PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

  // Collect every open shadow root (recursively).
  const roots = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        walk(el.shadowRoot);
      }
    }
  };
  walk(document);

  // Rule pruning: keep a style rule only if its selector (minus pseudo
  // classes/elements) matches something in the scope it applies to.
  const strip = (sel) =>
    sel
      .replace(/(?<!\\)::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, (m) =>
        /^:(is|where|not|has)\(/.test(m) ? m : "",
      )
      .replace(/(^|[\s>+~,(])(?=[\s>+~,)]|$)/g, "$1*")
      .trim() || "*";
  const ruleText = (rule, scope) => {
    if (rule instanceof CSSStyleRule) {
      let keep = false;
      try {
        keep = !!scope.querySelector(strip(rule.selectorText));
      } catch {
        keep = true;
      }
      if (/:host|::slotted|::part/.test(rule.selectorText)) keep = true;
      return keep ? rule.cssText : "";
    }
    if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || (window.CSSLayerBlockRule && rule instanceof CSSLayerBlockRule) || (window.CSSContainerRule && rule instanceof CSSContainerRule)) {
      const inner = [...rule.cssRules].map((r) => ruleText(r, scope)).join("\n");
      if (!inner.trim()) return "";
      const head = rule.cssText.slice(0, rule.cssText.indexOf("{"));
      return `${head}{\n${inner}\n}`;
    }
    if (rule instanceof CSSImportRule) return rule.styleSheet ? sheetText(rule.styleSheet, scope) : "";
    if (rule instanceof CSSFontFaceRule) return "";
    return rule.cssText; // @keyframes, @property, @layer statements, …
  };
  const sheetText = (sheet, scope) => {
    try {
      return [...sheet.cssRules].map((r) => ruleText(r, scope)).filter(Boolean).join("\n");
    } catch {
      // Cross-origin: parse the text fetched by Node, then prune it.
      const text = sheet.href && external[sheet.href];
      if (!text) return "";
      const copy = new CSSStyleSheet();
      copy.replaceSync(text.replace(/@import[^;]+;/g, ""));
      return [...copy.cssRules].map((r) => ruleText(r, scope)).filter(Boolean).join("\n");
    }
  };

  // Inline document styles: replace every <link rel=stylesheet>/<style>
  // with one <style> each, in order. Adopted sheets appended.
  for (const sheet of [...document.styleSheets]) {
    const owner = sheet.ownerNode;
    if (!owner) continue;
    const style = document.createElement("style");
    if (sheet.media && sheet.media.mediaText) style.media = sheet.media.mediaText;
    style.textContent = sheet.disabled ? "" : sheetText(sheet, document);
    owner.replaceWith(style);
  }
  for (const sheet of document.adoptedStyleSheets ?? []) {
    const style = document.createElement("style");
    style.textContent = sheetText(sheet, document);
    document.head.append(style);
  }
  for (const root of roots) {
    for (const sheet of [...root.styleSheets]) {
      const owner = sheet.ownerNode;
      if (!owner) continue;
      const style = document.createElement("style");
      style.textContent = sheetText(sheet, root);
      owner.replaceWith(style);
    }
    for (const sheet of root.adoptedStyleSheets ?? []) {
      const style = document.createElement("style");
      style.textContent = sheetText(sheet, root);
      root.prepend(style);
    }
  }

  const all = [document, ...roots];
  for (const root of all) {
    // Freeze images at their rendered size.
    for (const img of root.querySelectorAll("img")) {
      const r = img.getBoundingClientRect();
      if (r.width && !img.getAttribute("width")) img.setAttribute("width", Math.round(r.width));
      if (r.height && !img.getAttribute("height")) img.setAttribute("height", Math.round(r.height));
      img.src = PLACEHOLDER;
      img.removeAttribute("srcset");
      img.removeAttribute("loading");
    }
    for (const s of root.querySelectorAll("picture source")) s.remove();
    for (const el of root.querySelectorAll("script, noscript, link[rel=preload], link[rel=modulepreload], link[rel=prefetch], link[rel=stylesheet], iframe, video, audio, object, embed, base, meta[http-equiv]"))
      el.remove();
    // Reflect live form state that matters for visibility/disabled only.
    for (const el of root.querySelectorAll("details[open]")) el.setAttribute("open", "");
  }

  // Strip inline event handlers.
  for (const root of all)
    for (const el of root.querySelectorAll("*"))
      for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);

  const html = document.documentElement.getHTML({ serializableShadowRoots: true, shadowRoots: roots });
  const attrs = [...document.documentElement.attributes].map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ");
  return `<!doctype html>\n<!-- snapshot of ${location.href} taken ${new Date().toISOString()} -->\n<html ${attrs}>${html}</html>`;
}
