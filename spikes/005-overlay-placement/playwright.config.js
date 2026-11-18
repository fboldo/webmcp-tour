import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  fullyParallel: true,
  use: { baseURL: "http://localhost:4005", viewport: { width: 1024, height: 768 } },
  webServer: { command: "node server.mjs", url: "http://localhost:4005/fixtures/hostile.html", reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    // webkit: cannot launch on this host (missing libavif16, needs sudo) — see README.
  ],
});
