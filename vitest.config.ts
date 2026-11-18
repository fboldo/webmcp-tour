import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { corpusAvailable, runCorpus } from "./test/corpus/commands.js";
import { waitInput, windowListeners } from "./test/wait-commands.js";
import { fixtures } from "./test/vite-fixtures.mjs";

export default defineConfig({
  plugins: [fixtures()],
  test: {
    include: ["test/**/*.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      viewport: { width: 1280, height: 1024 },
      instances: [{ browser: "chromium" }, { browser: "firefox" }],
      commands: {
        corpusAvailable,
        runCorpus,
        waitInput,
        windowListeners,
        // Media emulation applies to the whole page, nested fixture iframes included.
        async emulateMedia(
          ctx,
          options: { forcedColors?: "active" | "none" | null; reducedMotion?: "reduce" | "no-preference" | null },
        ) {
          await ctx.page.emulateMedia(options);
        },
      },
    },
  },
});
