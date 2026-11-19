# Documentation site

A static site: Markdown in `site/content/` becomes HTML in `site/dist/` (gitignored), with the live demo copied in. No framework, no server, no external requests.

```sh
pnpm docs:dev      # build, serve http://127.0.0.1:4174/ (PORT overrides), rebuild when content, assets or demo/ change
pnpm docs:build    # pnpm build, then site/dist for https://fboldo.github.io/webmcp-tour/
pnpm docs:deploy   # build, then force-push site/dist to the gh-pages branch of origin (publishes!)
```

## Why a small build script, not VitePress

The site is ten Markdown pages and one template. `site/build.mjs` is about 250 lines with one dependency (`marked`, a dev dependency), builds in well under a second, ships no JavaScript to the reader and has no framework to keep up to date. VitePress would add Vite, Vue and a theme for features (search, client routing) this site does not need. The same Markdown can move to a framework later: it is plain Markdown with a small front matter.

## Layout

- `content/*.md`: one page each. Front matter: `title`, `description`, `order` (all required). Link pages with `[text](other-page.md)`; the build turns those into site URLs. Other relative links (`demo/`, `llms.txt`) and images (`images/x.png`) are made base-aware. The page title is the H1; start the body at H2.
- `content/images/`: the screenshots (committed; see below).
- `assets/style.css`: light and dark by system preference, forced-colors, reduced motion, responsive.
- `build.mjs`: the build and the dev server. `deploy.mjs`: the gh-pages push.

## What the build produces

- `index.html`, `<page>/index.html`: the docs, each with a `<page>.md` source next to it.
- `llms.txt` and `llms-full.txt`, from the same content, following [llmstxt.org](https://llmstxt.org): an H1, a blockquote summary, then H2 sections listing links to each page's `.md`. Links are absolute (set `DOCS_SITE_URL`).
- `demo/`: a copy of the repository's `demo/` with absolute paths rewritten for the base path, and each of its routes (`demo/billing/`, …) as a real file, since Pages has no fallback for single-page apps. `lib/` is the built library (`dist/*.js`), `vendor/polyfill.js` the W3C polyfill the demo uses where a browser has no WebMCP. The build throws if the demo stops matching the patterns it rewrites.

## Settings

| Variable | Default | |
|---|---|---|
| `DOCS_BASE` | `/webmcp-tour/` | URL path the site is served under. Use `/` for a custom domain or a user site. `docs:dev` always uses `/`. |
| `DOCS_SITE_URL` | `https://fboldo.github.io/webmcp-tour/` | Absolute URL used in `llms.txt`, `llms-full.txt` and the `.md` files. |

## Screenshots

The images in `content/images/` are captured from the demo with its scripted agent by `scripts/docs-screenshots.mjs` (needs `pnpm build` and Playwright's Chromium). Run `node scripts/docs-screenshots.mjs` after a visible change to the overlay or the demo and commit the PNGs. The script fails if one goes over 200 KB.

## Going live

Nothing here enables Pages or publishes anything by itself. To go live:

1. **GitHub Pages on a private repository needs a paid plan** (GitHub Pro, Team or Enterprise); on a free plan the repository must be **public**.
2. Pick one:
   - **Actions:** Settings > Pages > Source: *GitHub Actions*, then run the **Docs** workflow (`.github/workflows/pages.yml`) with *Run workflow*. It is manual-only because the account has no Actions minutes.
   - **Branch:** run `pnpm docs:deploy` locally (it needs push access to `origin`), then Settings > Pages > Source: *Deploy from a branch*, `gh-pages` / root.
3. The site appears at `https://fboldo.github.io/webmcp-tour/`. For another path or domain, set `DOCS_BASE` and `DOCS_SITE_URL` for the build (and in the workflow).

The docs say the package is not on npm yet; update `quick-start.md` and `faq.md` when it is. The demo copy of the W3C polyfill is Apache-2.0 (its licence file is copied next to it).
