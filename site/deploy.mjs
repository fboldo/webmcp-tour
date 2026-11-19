// Pushes site/dist to the gh-pages branch of `origin` (a force-push of a one-commit branch).
// Run `pnpm docs:deploy` only when you mean to publish: it overwrites gh-pages.
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: here, encoding: "utf8" }).trim();

execFileSync(process.execPath, [join(here, "build.mjs")], { stdio: "inherit", env: process.env });
const tmp = mkdtempSync(join(tmpdir(), "webmcp-tour-pages-"));
try {
  cpSync(join(here, "dist"), tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "gh-pages");
  git(tmp, "add", "-A");
  git(tmp, "-c", "user.name=docs", "-c", "user.email=docs@users.noreply.github.com", "commit", "-q", "-m", "Deploy docs");
  git(tmp, "push", "--force", remote, "gh-pages");
  console.log("docs: pushed gh-pages");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
