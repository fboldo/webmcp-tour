#!/usr/bin/env node
// Heuristic audit: interactive elements without data-tour-id / data-tour-description.
// Only lowercase (DOM) tags are checked; framework components such as <Button> are not.
// Usage: node audit.mjs [--json] [--strict] <dir|file>...   No dependencies, Node 18+.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTS = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage"]);
const TAGS = new Set(["button", "a", "input", "select", "textarea", "summary"]);
const ROLES = new Set(["button", "link", "tab", "menuitem", "checkbox", "switch", "radio"]);

/** Tags with their attribute text, found by a small scanner that respects quotes and {braces} so `=>` or `>` in JSX props do not end a tag. */
export function* scanTags(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "<" || !/[A-Za-z]/.test(src[i + 1] ?? "")) continue;
    let j = i + 1, depth = 0, quote = "";
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = ""; continue; }
      if (c === '"' || c === "'" || (c === "`" && depth)) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth = Math.max(0, depth - 1);
      else if (c === ">" && depth === 0) break;
    }
    const raw = src.slice(i, j + 1);
    const name = /^<([A-Za-z][\w.:-]*)/.exec(raw)[1];
    yield { name, attrs: raw.slice(name.length + 1, -1), start: i, end: j + 1 };
    i += name.length;
  }
}

const has = (attrs, a) => new RegExp(`(^|[\\s"'}])${a}(\\s|=|/|$)`).test(attrs);
const attrValue = (attrs, a) => new RegExp(`(?:^|\\s)${a}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)?.slice(1).find((v) => v !== undefined);

function interactive(name, attrs) {
  if (name !== name.toLowerCase()) return false; // <Button> is a component: its markup is not visible here
  const n = name;
  if (n === "input") return attrValue(attrs, "type")?.toLowerCase() !== "hidden";
  if (n === "a") return has(attrs, "href") || has(attrs, ":href") || has(attrs, "to");
  if (TAGS.has(n)) return true;
  const role = attrValue(attrs, "role");
  return role !== undefined && ROLES.has(role.toLowerCase());
}

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Visible text (or aria-label / placeholder / value) a person would read on the control. */
function nameOf(src, tag) {
  const label = attrValue(tag.attrs, "aria-label") ?? attrValue(tag.attrs, "data-tour-label") ?? attrValue(tag.attrs, "placeholder") ?? (/^(submit|button|reset)$/i.test(attrValue(tag.attrs, "type") ?? "") ? attrValue(tag.attrs, "value") : undefined);
  if (label) return label.trim();
  const close = src.toLowerCase().indexOf(`</${tag.name.toLowerCase()}`, tag.end);
  if (close < 0 || close - tag.end > 400) return "";
  return src.slice(tag.end, close).replace(/<[^>]*>|\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
}

export function auditSource(src, file = "<input>") {
  const lineAt = (pos) => src.slice(0, pos).split("\n").length;
  const findings = [];
  for (const tag of scanTags(src)) {
    if (!interactive(tag.name, tag.attrs) || has(tag.attrs, "data-tour-exclude")) continue;
    const id = has(tag.attrs, "data-tour-id") || has(tag.attrs, ":data-tour-id");
    const desc = has(tag.attrs, "data-tour-description") || has(tag.attrs, ":data-tour-description");
    if (id && desc) continue;
    const name = nameOf(src, tag);
    findings.push({
      file, line: lineAt(tag.start), tag: tag.name, name,
      missing: id ? ["data-tour-description"] : desc ? ["data-tour-id"] : ["data-tour-id", "data-tour-description"],
      suggestion: `${id ? "" : `data-tour-id="${slug(name) || "TODO"}" `}${desc ? "" : 'data-tour-description="TODO: what it does and what happens next"'}`.trim(),
    });
  }
  return findings;
}

function* files(path) {
  const st = statSync(path);
  if (st.isFile()) return yield path;
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) yield* files(join(path, e.name));
    else if (e.isFile() && EXTS.has(extname(e.name))) yield join(path, e.name);
  }
}

function main(argv) {
  const json = argv.includes("--json"), strict = argv.includes("--strict");
  const paths = argv.filter((a) => !a.startsWith("--"));
  if (!paths.length) {
    console.error("usage: node audit.mjs [--json] [--strict] <dir|file>...");
    return 2;
  }
  const all = [];
  for (const p of paths) for (const f of files(p)) all.push(...auditSource(readFileSync(f, "utf8"), f));
  if (json) console.log(JSON.stringify(all, null, 2));
  else {
    for (const f of all) console.log(`${f.file}:${f.line} <${f.tag}> "${f.name}" missing ${f.missing.join(", ")}\n    add: ${f.suggestion}`);
    console.log(`\n${all.length} interactive element(s) to review. Mark destructive or sensitive ones with data-tour-exclude instead; skip purely decorative ones.`);
  }
  return strict && all.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
