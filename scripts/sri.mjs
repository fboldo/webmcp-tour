// Prints the Subresource Integrity hash of the built script-tag file and a ready-to-paste tag.
// Run `pnpm build && pnpm sri` at release time, after the version in package.json is final.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function sriHash(file = "dist/webmcp-tour.js") {
  return `sha384-${createHash("sha384").update(readFileSync(file)).digest("base64")}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const hash = sriHash();
  console.log(hash);
  console.log(`<script src="https://unpkg.com/webmcp-tour@${version}/dist/webmcp-tour.js" integrity="${hash}" crossorigin="anonymous"></script>`);
}
