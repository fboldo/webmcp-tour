// Release prep: builds, hashes dist/webmcp-tour.js, and rewrites every pinned CDN snippet
// (version + integrity) in README.md, site/content and skills to the package.json version.
// Idempotent. Run `pnpm release:prepare` after bumping the version.
// `--check` (used by `pnpm check`) rewrites nothing: it fails if a pinned snippet names another
// version than package.json or lacks an integrity attribute. It does not compare the hash: between
// releases the local build differs from the published file. The release workflow checks the hash.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sriHash } from "./sri.mjs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const check = process.argv.includes("--check");
if (!check) execSync("pnpm build", { stdio: "inherit" });
const hash = check ? "" : sriHash();

const files = ["README.md"];
for (const dir of ["site/content", "skills"]) {
  for (const f of readdirSync(dir, { recursive: true })) if (String(f).endsWith(".md")) files.push(join(dir, String(f)));
}

const SCRIPT_TAG = /<script\b[^>]*?src="https:\/\/unpkg\.com\/webmcp-tour@[^/"]+\/dist\/webmcp-tour\.js"[^>]*>/g;
const PIN = /(unpkg\.com\/webmcp-tour@)[^/"\s]+/g;

function pinTag(tag) {
  tag = tag.replace(PIN, `$1${version}`);
  if (/\bintegrity="/.test(tag)) return tag.replace(/\bintegrity="[^"]*"/, `integrity="${hash}"`);
  if (/\bcrossorigin\b/.test(tag)) return tag.replace(/(\s*)crossorigin/, `$1integrity="${hash}"$1crossorigin`);
  return tag.replace(/\s*>$/, ` integrity="${hash}" crossorigin="anonymous">`);
}

const stale = [];
for (const file of files) {
  const before = readFileSync(file, "utf8");
  if (check) {
    const tags = before.match(SCRIPT_TAG) ?? [];
    if (before.replace(PIN, `$1${version}`) !== before || tags.some((t) => !/\bintegrity="sha384-/.test(t))) stale.push(file);
    continue;
  }
  const after = before.replace(SCRIPT_TAG, pinTag).replace(PIN, `$1${version}`);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`updated ${file}`);
  }
}
if (check && stale.length) {
  console.error(`CDN snippets are not pinned to ${version} (or lack integrity) in:\n  ${stale.join("\n  ")}\nRun \`pnpm release:prepare\`.`);
  process.exit(1);
}
console.log(check ? `✓ CDN snippets pinned to ${version}` : `pinned to ${version} ${hash}`);
