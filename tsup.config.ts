import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Bundler entries: dist/index.js, dist/auto.js (+ .d.ts).
    entry: { index: "src/index.ts", auto: "src/auto.ts" },
    format: ["esm"],
    platform: "browser",
    target: "es2022",
    dts: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    // Script-tag build: dist/webmcp-tour.js, global `webmcpTour`.
    entry: { "webmcp-tour": "src/iife.ts" },
    format: ["iife"],
    globalName: "webmcpTour",
    platform: "browser",
    target: "es2022",
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: ".js" }),
  },
]);
