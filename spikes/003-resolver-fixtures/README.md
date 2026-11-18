# Spike 003 — resolver-fixtures

**Verdict: PARTIAL.** Text resolution of real pages works, but not with the
rules exactly as `plan.md` v2 writes them. As written, the resolver passes
**88.1%** (140/159) and **silently picks the wrong element in 6 of 159
queries (3.8%)**. With six rule changes it passes **98.7%** (157/159), with
**1 silent wrong pick (0.6%)**. Every rule change is listed under
[Plan changes](#plan-changes).

## Question

The plan says the main way `tour_show_step({ text })` fails is "quietly
matching the wrong element". Do the plan's resolution rules pick the element
a human means on real pages? These are the accessible-name ranking, NFKC
normalization, the ancestor collapse, the exclusions, the visibility rule
and tie-only ambiguity. What pass threshold should the corpus enforce in CI?

**Given** ~10 saved real pages and ~100 labelled `text` queries,
**when** the resolver runs the corpus in a real browser,
**then** it meets a pass threshold, and the corpus then runs in CI.

## Method

- **Fixtures** (`capture.mjs`, `pages.json`, `fixtures/*.html.gz`, 752 KB
  in total). There are 17 public, logged-out pages, captured with
  Playwright/Chromium at 1280×800.
  - Each fixture is the rendered DOM after load. Open shadow roots are
    serialized as declarative shadow DOM (`getHTML({ serializableShadowRoots })`).
    Scripts, iframes and media are removed. Images are replaced by
    placeholders of the same size.
  - Every stylesheet is inlined: same-origin and CORS sheets, cross-origin
    sheets fetched from Node, `@import`s and adopted sheets. Each sheet is
    pruned to the rules whose selector matches something.
  - `fixture-server.mjs` serves a fixture with **every network request
    aborted**, so runs are reproducible offline.
  - The pages cover GitHub (a repo page and the issue list), a shadcn/ui
    settings form and its tasks data table, MDN (Lit shadow DOM), a
    Wikipedia article and its create-account form, Shoelace docs (shadow
    DOM), Angular Material tables (icon ligatures and `text-transform`),
    Hacker News, npm, and a GOV.UK summary list (visually hidden link
    context).
  - Held-out pages: the-internet tables, react.dev, Vercel pricing,
    material-web (Lit) and the Sauce Labs demo login.
- **Resolver** (`resolver.js`). This is a throwaway, literal implementation
  of step 3 of the plan's resolution order, its visibility rule and its
  ambiguity rule.
  - Every deviation from the plan is an option flag. With all flags off it
    behaves exactly as the plan describes.
  - Interpretations the plan leaves open:
    - Name-from-content walks the flat tree: slots, `img` alt, SVG
      `<title>`, and descendants' `aria-label`. It skips `display:none` and
      `aria-hidden` content.
    - "Collapse to nearest interactive ancestor" is followed by "drop any
      target that contains another target", so the innermost one is kept.
    - Two or more substring hits always return `ambiguous`, as the plan
      says.
- **Corpus** (`queries.json`, the *dev* set: 118 queries on 12 pages).
  - 88 queries expect an element, 17 expect `ambiguous`, and 13 expect
    `not_found`.
  - Ground truth is the element *a human means*. It is encoded with
    Playwright's `getByRole` / `getByLabel` / `getByPlaceholder` / CSS
    locators. Playwright's accessible-name code is independent of this
    resolver.
  - Each label must resolve to exactly one visible element, or the run
    fails.
  - Where a human would accept two answers (for example a TOC link *or*
    `ambiguous` for "Browser compatibility"), the query lists them in
    `accept`.
  - Highlighting element A counts as correct for expected element B when
    one contains the other and their boxes are within 4× in area. Examples
    are a `<span>` inside a link, or the inner `<button>` of a shadow host.
- **Held-out set** (`queries-holdout.json`: 41 queries on 5 new pages). It
  was labelled **after** the recommended rules were frozen
  (`recommended-frozen`), without first running the resolver on it.
  - Two locators were fixed after the first run because they matched zero
    elements: an `h3` that is really an `h4`, and the material-web checkbox,
    whose custom element is not upgraded in a static snapshot. Neither fix
    changed which element the label means.
- **Runner** (`run.mjs`). It runs every query under 14 rule variants in
  headless Chromium 141 (Playwright 1.56.1) and classifies each outcome:

| outcome | meaning | harm |
|---|---|---|
| `pass` | expected element, or an accepted alternative | — |
| `wrong_element` | matched a different element than the one meant | **silent wrong** |
| `silent_pick` | expected `ambiguous`, but one element was auto-picked | **silent wrong** |
| `false_positive` | expected `not_found`, but something was matched | **silent wrong** |
| `spurious_ambiguous` | expected one element, got `ambiguous` | safe: the agent gets candidates and can retry with `index`/`selector` |
| `false_ambiguous` | expected `not_found`, got `ambiguous` | safe-ish |
| `missed` | expected an element, got `not_found` | safe: the agent falls back to a selector |

## Results

The full tables are in `results/summary.md`. Per-query output for `plan` and
`recommended` is in `results/*.json`.

| variant | dev (118) | held-out (41) | all (159) | silent wrong (all) | median / max ms |
|---|---|---|---|---|---|
| **plan as written** | 85.6% | 95.1% | **88.1%** | **6** (4 wrong, 2 false +) | 14 / 53 |
| + labelToControl | 92.4% | 95.1% | 93.1% | 5 | |
| + preferInteractive | 94.1% | 95.1% | 94.3% | 6 | |
| + strictVisibility | 88.1% | 95.1% | 89.9% | 6 | |
| + substringInteractiveOnly | 87.3% | 95.1% | 89.3% | 6 | |
| + opacityFields | 86.4% | 95.1% | 88.7% | 5 | |
| + leafTabindex | 85.6% | 97.6% | 88.7% | 5 | |
| + visibleTextToo *(rejected)* | 84.7% | 95.1% | 87.4% | 6 | |
| + caseTiebreak *(rejected)* | 85.6% | 92.7% | 87.4% | **7** (+1 silent pick) | |
| + substringBest2x *(rejected)* | 84.7% | 95.1% | 87.4% | **7** (+1 wrong) | |
| recommended-frozen (first 5 changes) | 98.3% | **97.6%** | 98.1% | 2 | 14 / 51 |
| **recommended** (all 6 changes) | 98.3% | 100% | **98.7%** | **1** | 14 / 56 |

The held-out pages are easier than the dev pages: the plan alone scores
95.1% on them. The dev set is the one that exercises form labels. **The
honest held-out figure for the frozen rules is 97.6%.** The sixth rule,
`leafTabindex`, came from the one held-out failure, so it has not been
validated on unseen pages.

**Timing.** One resolve walks the whole document plus open shadow roots. The
median is 14 ms and the worst case 56 ms (Angular Material: about 3,000
visible controls and 30 tables), measured on a Linux laptop, headless. This
is acceptable for a tool call, and it needs a `textContent` prefilter. The
prefilter is in `resolver.js`.

### Failure categories, plan as written (19 failures)

1. **Label text competes with its own control: 8 spurious `ambiguous`, 1
   wrong element.**
   - `<label for=x>Username</label><input id=x>` gives two exact matches,
     the label text and the input named by it, so the query returns
     `ambiguous`.
   - The ancestor collapse cannot help, because the label does not contain
     the input.
   - Where the input's name is longer ("Email address (optional)"), the
     `<span>` inside the label wins outright: a **wrong element**.
   - Seen on shadcn (4), the Wikipedia form (4) and GitHub "Search issues".
2. **Duplicate non-interactive text ties with the control: 2 spurious
   `ambiguous`.** The two cases are npm tab "Readme" vs `<h2>Readme`, and MDN
   "Filter" vs its sr-only "Filter sidebar" span. A heading or a label-ish
   span with the same text as a control turns every such query ambiguous.
3. **Off-screen and sr-only elements count as visible: 2 false positives.**
   - Skip links parked at `top:-320px` (MDN, the-internet) pass
     `checkVisibility()` and have a non-zero box, so "Skip to main content"
     resolves to an element the user cannot see. `scrollIntoView` cannot
     reach it.
   - sr-only spans (1×1 px, `clip: rect(0 0 0 0)`) are candidates too.
4. **Opacity-0 native controls are invisible: 1 missed, 1 wrong element.**
   - Wikipedia's custom radios and its CSS-only "43 languages" dropdown
     keep the real `<input>` at `opacity:0`, laid over a styled proxy (the
     proxy label is even `aria-hidden`).
   - `checkVisibility({ opacityProperty: true })` rejects the real click
     target. The query then misses, or resolves to the text `<span>`.
   - This is a common pattern for custom-styled checkboxes and radios.
5. **"Nearest interactive ancestor" climbs into focusable containers: 1
   wrong element (held-out).**
   - On material-web, `<main tabindex="0">` counts as interactive, so the
     label "Checkbox one" collapsed to the whole `<main>`.
   - Focusable containers are common: 72 `tabindex=0` elements on MDN
     (code blocks), 23 on npm and 16 on Angular.
6. **Prose substrings: 1 false `ambiguous`.** "visitors" matched three
   paragraphs and a navbox. Nothing on the page is a control called
   "visitors", so the correct answer is `not_found`.
7. **Unlabelled field: 1 wrong element, still failing.**
   - Hacker News' search box is `Search: <input name=q>`: a bare text node
     with no `<label>`. The best text match is the `<form>`.
   - **Kept as a known failure.** Inventing implicit labels from
     neighbouring text is a heuristic too far; the agent can use the
     `selector` locator.
8. **Substring tie that a human would resolve: 1 spurious `ambiguous`,
   still failing.**
   - On npm, "Code" matches the tab "Code Beta" and 7 links containing
     "VS Code".
   - This is a safe failure. The candidates come back with context, so the
     agent can retry with `index: 0`.

### What worked as specified

- **NFKC and the whitespace, ellipsis and punctuation stripping.** These
  handled `Search documentation... ⌘ K`, `text-transform: uppercase`
  ("OKAY, GOT IT") and `checkVisibility()` with no misses.
- **Accessible-name precedence.** Icon-only buttons named by `aria-label`
  (8/8) all resolved. `placeholder`-only fields resolved 3/4; the miss is
  MDN "Filter", which belongs to category 2.
- **Icon-font ligatures.** They were never a problem: Angular Material puts
  `aria-hidden="true"` on `<mat-icon>`, and the exclusion removes it.
- **Open shadow roots.** Shoelace, MDN (Lit) and material-web all resolved
  through `<slot>` assignment.
- **Exact tier over substring tier.** HN "comments" vs "177 comments", npm
  "Search" vs "Search packages".
- **Tie-only `ambiguous` plus `index`.** The plan never silently picked
  among the 22 queries expected to be ambiguous. `index` resolved 3/3.
- **Hidden menus.** GitHub's closed "Products" menu and Wikipedia's
  collapsed main menu were correctly `not_found`.
- **Real non-interactive targets.** Matching is not limited to controls,
  and this was right four times: "Weekly Downloads" (npm), a card title on
  GOV.UK, a table caption heading and a logo. Dropping non-interactive
  exact matches would break these.

### Rejected candidate rules

- **Case-sensitive tie-break.** It caused a **silent pick** on unseen data:
  on Vercel, the header "Get a Demo" was picked over the card's "Get a
  demo". Case is too weak a signal.
- **Auto-pick the best substring ratio (≥ 2×).** It caused a **wrong
  element** on GOV.UK. "Withdraw" picked "Withdraw (University of
  Gloucestershire)" over "(… Bristol)" only because the hidden suffix is
  shorter. Keep the plan's rule: never auto-pick between substring hits.
- **Also match visible text when `aria-label` differs** (label-in-name).
  It gained nothing. In every label-in-name case in the corpus (GitHub
  "Fork" and "Notifications", MDN "Theme", Angular "GitHub"), the
  `aria-label` already contained the visible word. On its own it caused a
  regression: the skip link "skip to sign in" gained the visible name "sign
  in". The residual risk is a WCAG 2.5.3 violation with no shared word,
  which returns `not_found`, a safe failure.

### Candidate context for `ambiguous`

The plan promises context such as "Delete, row 3 of the Invoices table".
Taking *the first heading of the enclosing section* produced useless context
("Welcome back", "click log" for every candidate). Changing to **the nearest
preceding heading in document order + row text + labelled landmark** makes
candidates distinguishable in 23 of the 26 ambiguous results. Examples:
Shoelace "Primary" gives `variants` / `outline buttons` / `loading`;
GOV.UK "Withdraw" gives the university name; table rows give their row text.
The remaining three (Angular "Next page" and "Hydrogen", and the shadcn
"URLs" fields) differ only by position. Including the `aria-label` of the nearest `role=group`
would separate the paginators ("Select page of users").

## Plan changes

Amend *tour_show_step → Resolution order → 3 / Visibility / Ambiguity*:

1. **Label collapse.** A match on, or inside, a `<label>` resolves to
   `label.control` when that control is visible, and to the label
   otherwise. It must never resolve to the label's inner text node or span.
   *(Fixes category 1: +8.)*
2. **Prefer interactive within a tier.** If the top tier has any interactive
   candidate, drop its non-interactive ones. Non-interactive exact matches
   remain valid when they are alone. *(Fixes category 2. On its own it adds
   +10 on dev, because it also settles most of category 1.)*
3. **Substring tier: interactive candidates only.** Prose substring hits
   return `not_found`. *(Fixes category 6.)*
4. **Visibility: skip the opacity check for native form controls**
   (`input`, `select`, `textarea`). Custom-styled checkboxes, radios and
   CSS-only dropdowns keep the native control at `opacity:0` as the click
   target, and its box is the right thing to highlight. *(Fixes category 4.)*
5. **Visibility: candidates must be perceivable.** Reject boxes under
   4×4 px, `clip: rect(0 0 0 0)` / `clip-path: inset(50%)` (the sr-only
   pattern), and boxes entirely above or left of the document (parked skip
   links). Such elements still *contribute* to their ancestors' names.
   *(Fixes category 3.)*
6. **The interactive ancestor must be a control, not a container.** An
   element that is interactive only through `tabindex` counts only if it is
   not a landmark (`main`, `nav`, `section`…) and contains no other
   control. *(Fixes category 5. Derived from the held-out set, so it is not
   yet validated on unseen pages.)*
7. **Candidate context = nearest preceding heading in document order + row
   text + nearest labelled landmark or group.** It replaces "nearest
   landmark or heading", which reads naturally as the section's first
   heading and is useless in practice.
8. **Keep, explicitly:**
   - never auto-pick between substring hits;
   - case-insensitive ties stay ties;
   - the plan's name precedence, with no extra visible-text name.

**CI threshold** (*Repo & tech*, *M1 done-when*):

- **Hard gate:** zero silent-wrong outcomes (`wrong_element`, `silent_pick`,
  `false_positive`) outside an explicit known-failures list. Today that list
  has one entry: HN "Search".
- **Soft gate:** pass rate ≥ 95% overall. Today it is 98.7%.
- **Process:** new fixtures enter as held-out queries and are scored
  *before* any rule is tuned on them. Any rule change reports its held-out
  delta.

**M1 should port this corpus, not rewrite it.** The fixtures, labels and
classifier are framework-free. Vitest browser mode can load
`fixtures/*.html.gz` through the same route-and-abort technique.

## Limitations

- **One labeller (the spike author)**, who labelled from screenshots and DOM
  dumps. The labels encode judgement calls, for example that a prose word
  is `not_found` and that a TOC link *or* `ambiguous` is right for a
  heading-duplicated name. The judgement calls are in `accept` and `note`.
- **Not tuned on the held-out set, but it is small.** 41 queries on 5
  pages, and easier than the dev set.
- **Static snapshots run no JS.** Custom elements are not upgraded, so
  there are no `ElementInternals` roles and no form-associated label links.
  Web fonts are not loaded, which changes layout slightly. The resolver
  logic is what is under test, so this is fine for regression. Live-page
  behaviour, such as menus opened by JS and virtualized lists, is out of
  scope, as the plan already says.
- **The fixtures are 2026-11-18 snapshots** of third-party pages. Re-running
  `capture.mjs` will produce different DOMs, so pin the committed fixtures
  and do not re-capture in CI.
- **Not measured:** the `near` list on `not_found`, `selector` / `target`
  resolution, `scrollIntoView`, and closed shadow roots.

## Run it

```sh
cd spikes/003-resolver-fixtures
npm install
npx playwright install chromium
node run.mjs                 # all variants → results/summary.md
node run.mjs --variant recommended --verbose   # print failures
node capture.mjs [name…]     # re-capture fixtures (changes them!)
node inspect.mjs <name> --shot   # labelling aid: visible controls + screenshot
```
