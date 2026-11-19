// Docs site build: site/content/*.md -> site/dist (static HTML, .md sources, llms.txt, llms-full.txt),
// plus the live demo (demo/ + the built dist/) so it runs from GitHub Pages.
//
//   node site/build.mjs          build once (DOCS_BASE, DOCS_SITE_URL: see site/README.md)
//   node site/build.mjs --dev    build with base "/", serve http://127.0.0.1:4174/, rebuild on change
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const out = join(here, "dist");
const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 4174);

const slash = (s) => (s.endsWith("/") ? s : `${s}/`);
const base = dev ? "/" : slash(process.env.DOCS_BASE ?? "/webmcp-tour/");
const siteUrl = slash(dev ? `http://127.0.0.1:${port}/` : (process.env.DOCS_SITE_URL ?? "https://fboldo.github.io/webmcp-tour/"));
const repoUrl = "https://github.com/fboldo/webmcp-tour";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const relative = (href) => !/^([a-z][a-z0-9+.-]*:|#|\/\/|\/)/i.test(href);

// ---- content ---------------------------------------------------------------------------------

/** `---` front matter: `key: value` lines (title, description, order, summary). */
function parse(file, raw) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  for (const k of ["title", "description", "order"]) if (!meta[k]) throw new Error(`${file}: front matter needs ${k}`);
  return { meta, body: raw.slice(m[0].length).trim() };
}

async function pages() {
  const dir = join(here, "content");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const all = [];
  for (const f of files) {
    const { meta, body } = parse(f, await readFile(join(dir, f), "utf8"));
    const slug = f.slice(0, -3);
    all.push({ slug, file: f, title: meta.title, description: meta.description, order: Number(meta.order), body, url: slug === "index" ? "" : `${slug}/` });
  }
  return all.sort((a, b) => a.order - b.order);
}

/** Page markdown for the .md outputs: relative links and images made absolute, so a copy elsewhere still works. */
const portable = (md) => md.replace(/(\]\()(?!https?:|#|mailto:|\/)([^)\s]+)\)/g, (_, open, href) => `${open}${siteUrl}${href})`);

// ---- markdown -> html ------------------------------------------------------------------------

function renderer(known) {
  const toc = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]*>/g, "") });
        return `<h${depth} id="${id}">${text}${depth > 1 ? ` <a class="anchor" href="#${id}" aria-label="Link to this section">#</a>` : ""}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        let url = href;
        const m = /^([\w-]+)\.md(#.*)?$/.exec(href);
        if (m) {
          const page = known.get(m[1]);
          if (!page) throw new Error(`broken link to ${href}`);
          url = `${base}${page.url}${m[2] ?? ""}`;
        } else if (relative(href)) url = `${base}${href}`;
        const external = /^https?:/i.test(href);
        return `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ""}${external ? ' rel="noopener"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }) {
        return `<img src="${esc(relative(href) ? base + href : href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy">`;
      },
      code({ text, lang }) {
        return `<pre tabindex="0"><code${lang ? ` class="language-${esc(lang)}"` : ""}>${esc(text)}\n</code></pre>\n`;
      },
      table(token) {
        const cell = (c, tag) => `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("");
        return `<div class="table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  return { marked, toc };
}

// ---- html template ---------------------------------------------------------------------------

function layout({ page, all, html, toc }) {
  const i = all.indexOf(page);
  const prev = all[i - 1];
  const next = all[i + 1];
  const nav = all.map((p) => `<li><a href="${base}${p.url}"${p === page ? ' aria-current="page"' : ""}>${esc(p.title)}</a></li>`).join("");
  const here = toc.length ? `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul></nav>` : "";
  const pager = `<nav class="pager" aria-label="Pages">${prev ? `<a rel="prev" href="${base}${prev.url}"><span>Previous</span>${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a rel="next" href="${base}${next.url}"><span>Next</span>${esc(next.title)}</a>` : ""}</nav>`;
  const title = page.slug === "index" ? "webmcp-tour: show users where to click" : `${page.title} · webmcp-tour`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${base}assets/style.css">
<link rel="alternate" type="text/markdown" href="${base}${page.slug}.md">
<link rel="describedby" href="${base}llms.txt">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <a class="brand" href="${base}">webmcp-tour</a>
  <a class="demo-link" href="${base}demo/">Live demo</a>
</header>
<div class="shell">
  <nav class="side" aria-label="Docs">
    <details open>
      <summary>Menu</summary>
      <ul>${nav}</ul>
      <p class="side-extra"><a href="${base}demo/"><strong>Live demo</strong></a><br><a href="${base}llms.txt">llms.txt</a> · <a href="${base}${page.slug}.md">This page as Markdown</a></p>
    </details>
  </nav>
  <main id="content" tabindex="-1">
    <article>
      <h1>${esc(page.title)}</h1>
      ${html}
    </article>
    ${pager}
  </main>
  ${here}
</div>
<footer class="foot">MIT licence · <a href="${repoUrl}" rel="noopener">Source on GitHub</a> · No trackers, no external requests.</footer>
</body>
</html>
`;
}

// ---- llms.txt ----------------------------------------------------------------------------------

const SUMMARY =
  "webmcp-tour is a zero-dependency TypeScript browser library that lets an AI agent show a user where to click instead of clicking for them. " +
  "It registers four WebMCP tools (tour_show_step, tour_list_targets, tour_dismiss, tour_wait_for_interaction) that highlight a control with a short explanation beside it; the user does the action. " +
  "It works with no setup on any page (the agent points at visible text) and gets better with declared targets, pages, and resume-after-navigation.";

function llms(all) {
  const list = all.map((p) => `- [${p.title}](${siteUrl}${p.slug}.md): ${p.description}`).join("\n");
  return `# webmcp-tour

> ${SUMMARY}

The library is pre-release. The pages below are plain Markdown; llms-full.txt has all of them in one file. Tool names and envelopes in the Tools reference are exact.

## Docs

${list}

## Optional

- [Live demo](${siteUrl}demo/): a fake settings app with the tools registered and a small in-page assistant
- [Full documentation in one file](${siteUrl}llms-full.txt): every page above, concatenated
- [Source code](${repoUrl}): the repository
`;
}

function llmsFull(all) {
  const docs = all.map((p) => `# ${p.title}\n\nSource: ${siteUrl}${p.slug}.md\n\n${portable(p.body)}`).join("\n\n---\n\n");
  return `# webmcp-tour (full documentation)\n\n> ${SUMMARY}\n\n---\n\n${docs}\n`;
}

// ---- demo --------------------------------------------------------------------------------------

/** Rewrites the demo's absolute paths for `base`. Throws when a pattern no longer matches, so a demo change cannot silently break the copy. */
function swap(name, text, pairs) {
  let s = text;
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`site: demo/${name} no longer contains ${JSON.stringify(from)}; update site/build.mjs`);
    s = s.replaceAll(from, to);
  }
  return s;
}

async function copyDemo() {
  const demo = join(repo, "demo");
  const dist = join(repo, "dist");
  const polyfill = join(repo, "node_modules/@w3c/webmcp-polyfill/dist/polyfill.js");
  const target = join(out, "demo");
  try {
    await readFile(join(dist, "index.js"));
  } catch {
    throw new Error("site: dist/ is missing: run `pnpm build` first (docs:build does)");
  }
  await mkdir(join(out, "lib"), { recursive: true });
  for (const f of (await readdir(dist)).filter((f) => f.endsWith(".js"))) await cp(join(dist, f), join(out, "lib", f));
  await mkdir(join(out, "vendor"), { recursive: true });
  await cp(polyfill, join(out, "vendor/polyfill.js"));
  await cp(join(repo, "node_modules/@w3c/webmcp-polyfill/LICENSE"), join(out, "vendor/polyfill.LICENSE")).catch(() => {});

  await mkdir(join(out, "shared"), { recursive: true });
  await cp(join(repo, "examples/shared/webmcp-env.js"), join(out, "shared/webmcp-env.js"));
  await mkdir(target, { recursive: true });
  const rules = {
    "app.js": [['const BASE = "/demo/";', `const BASE = "${base}demo/";`]],
    "tour.js": [['"/dist/index.js"', `"${base}lib/index.js"`]],
  };
  let html = "";
  for (const f of await readdir(demo)) {
    if (f.endsWith(".md") || f.endsWith(".d.ts")) continue;
    if (f === "index.html") {
      html = swap(f, await readFile(join(demo, f), "utf8"), [
        ['src="/shared/webmcp-env.js"', `src="${base}shared/webmcp-env.js"`],
        ["/node_modules/@w3c/webmcp-polyfill/dist/polyfill.js", `${base}vendor/polyfill.js`],
        ['href="/demo/', `href="${base}demo/`],
        ['href="demo.css"', `href="${base}demo/demo.css"`],
        ['src="demo.js"', `src="${base}demo/demo.js"`],
        ['src="assistant.js"', `src="${base}demo/assistant.js"`],
      ]);
      continue;
    }
    const text = await readFile(join(demo, f), "utf8");
    await writeFile(join(target, f), rules[f] ? swap(f, text, rules[f]) : text);
  }
  // Pages has no server fallback: every route the app can push is also a real file, so a reload or a shared link works.
  await writeFile(join(target, "index.html"), html);
  for (const view of ["billing", "team", "security", "notifications"]) {
    await mkdir(join(target, view), { recursive: true });
    await writeFile(join(target, view, "index.html"), html);
  }
}

// ---- build -------------------------------------------------------------------------------------

async function build() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const all = await pages();
  const known = new Map(all.map((p) => [p.slug, p]));
  if (!known.has("index")) throw new Error("site/content/index.md is required");
  for (const page of all) {
    const { marked, toc } = renderer(known);
    const html = marked.parse(page.body);
    const dir = page.slug === "index" ? out : join(out, page.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), layout({ page, all, html, toc }));
    await writeFile(join(out, `${page.slug}.md`), `# ${page.title}\n\n${portable(page.body)}\n`);
  }
  await writeFile(join(out, "llms.txt"), llms(all));
  await writeFile(join(out, "llms-full.txt"), llmsFull(all));
  await writeFile(join(out, ".nojekyll"), "");
  await mkdir(join(out, "assets"), { recursive: true });
  await cp(join(here, "assets"), join(out, "assets"), { recursive: true });
  await cp(join(here, "content/images"), join(out, "images"), { recursive: true }).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  await copyDemo();
  console.log(`docs: built ${all.length} pages -> site/dist (base ${base})`);
}

await build();

if (dev) {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png" };
  createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(out, path));
    if (!file.startsWith(out)) return void ((res.statusCode = 404), res.end("not found"));
    try {
      res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  }).listen(port, "127.0.0.1", () => console.log(`docs: http://127.0.0.1:${port}/`));

  let timer;
  const again = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 150);
  };
  for (const dir of [join(here, "content"), join(here, "assets"), join(repo, "demo")]) watch(dir, { recursive: true }, again);
}
