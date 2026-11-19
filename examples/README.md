# Examples

Three small apps for trying webmcp-tour with a real agent host. Each serves on `localhost`, which counts as a secure context, so WebMCP works without HTTPS.

| Example | Shows | Run |
|---|---|---|
| [`script-tag/`](script-tag) | One `<script src>`, declared and undeclared targets, an excluded control, a hidden control with a reveal hint | `pnpm example:script-tag` |
| [`bundled/`](bundled) | `createTour` + `registerAsWebMcpTool` in a Vite SPA; targets and pages (SPA routes with `navigate`) | `pnpm example:bundled` |
| [`embed/`](embed) | Your own tool (`change_plan`) calling `tour.show()` inside `execute`, plus the tour tools under custom names | `pnpm example:embed` |

Run `pnpm install` once first. Every command builds the library, then serves the example (default port 5173; `PORT=… pnpm example:script-tag` changes it for the first and last).

## Hosts

- **Chrome or Edge with WebMCP:** enable the WebMCP flag, open the page, and use the browser's agent.
- **Playwright MCP:** launch Chrome with `--enable-features=WebMCP` (see the root README). Tools show up as `webmcp_<name>` after a snapshot.
- **ChatGPT Desktop, Brave:** open the page in a WebMCP-capable browser session and ask the questions listed in each example.
- **No WebMCP in your browser:** nothing to do: the pages detect that and load the W3C polyfill plus a small "Tool tester" panel to list and call the tools by hand (a status line says "Polyfill (in-page agents only)"). Native hosts never see polyfilled tools; where the browser has native WebMCP the polyfill is not loaded. `?webmcp=native` or `?webmcp=polyfill` overrides the detection.
