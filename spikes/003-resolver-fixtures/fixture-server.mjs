// Serve gzipped fixtures to a Playwright page fully offline: the fixture is
// fulfilled from disk and every other request is aborted.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export const ORIGIN = "https://fixture.test";

export async function openFixture(context, name) {
  const html = gunzipSync(readFileSync(new URL(`./fixtures/${name}.html.gz`, import.meta.url))).toString("utf8");
  const page = await context.newPage();
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/${name}`) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/${name}`, { waitUntil: "load" });
  return page;
}

export const contextOptions = {
  viewport: { width: 1280, height: 800 },
  locale: "en-US",
  colorScheme: "light",
  javaScriptEnabled: true,
};
