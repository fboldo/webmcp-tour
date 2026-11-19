// Prints the Subresource Integrity hash of the built script-tag file and a ready-to-paste tag.
// Run `pnpm build && pnpm sri` at release time, after the version in package.json is final.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const hash = `sha384-${createHash("sha384").update(readFileSync("dist/webmcp-tour.js")).digest("base64")}`;
console.log(hash);
console.log(`<script src="https://unpkg.com/webmcp-tour@${version}/dist/webmcp-tour.js" integrity="${hash}" crossorigin="anonymous"></script>`);
