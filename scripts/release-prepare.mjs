// Release prep: builds, hashes dist/webmcp-tour.js, and rewrites every pinned CDN snippet
// (version + integrity) in README.md, site/content and skills to the package.json version.
// Idempotent. Run `pnpm release:prepare` after bumping the version.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sriHash } from "./sri.mjs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
execSync("pnpm build", { stdio: "inherit" });
const hash = sriHash();

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

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(SCRIPT_TAG, pinTag).replace(PIN, `$1${version}`);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`updated ${file}`);
  }
}
console.log(`pinned to ${version} ${hash}`);
