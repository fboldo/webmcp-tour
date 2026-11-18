# Try-it demo

A fake settings app (Acme Cloud) with the tour tools registered, a control panel that drives `window.webmcpTour` by hand, and an **Ask the assistant** panel: a small in-page agent that picks tour tools to answer "how do I…?" and shows every tool call and result in a transcript.

```sh
pnpm demo        # builds, then serves http://127.0.0.1:4173/demo/  (PORT overrides)
```

`http://localhost` counts as a secure context; WebMCP needs one. Where Chrome has no native WebMCP, the page loads the W3C polyfill (a dev dependency, served only by the demo server) to provide `document.modelContext`.

## The assistant

Three modes, picked from the **Mode** menu (default **Auto**). The status line above the transcript always says which one is running.

| Mode | What runs | Needs |
|---|---|---|
| **Scripted demo** | A handful of canned question → tool-call mappings. No AI model; answers are fixed text. The tool calls are real. | Nothing. Used automatically when the Prompt API is missing or its model unavailable. `?agent=scripted` pins it. |
| **Model, JSON-constrained** | Chrome's Prompt API (`LanguageModel`, Gemini Nano). The model replies `{ tool, args, answer }` under a `responseConstraint` JSON Schema; the page calls the tool through `document.modelContext.executeTool` and feeds the result back, until the model sends `final_answer` (6 steps at most). | Prompt API + the on-device model. |
| **Model, native tool use** | The page's registered tools are passed to `LanguageModel.create({ tools })` and Chrome runs the loop. | As above, plus `chrome://flags/#prompt-api-tool-use` set to Enabled. If the session cannot be created with tools, the page falls back to the JSON-constrained mode and says so in the transcript. |

**Auto** uses the JSON-constrained mode when a model is available (it works without the tool-use flag) and the scripted agent otherwise. Pick native tool use explicitly to try the flag.

### Requirements for the on-device model

From the [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api):

- Desktop Chrome (Windows 10/11, macOS 13+, Linux, or a Chromebook Plus). Not Android or iOS.
- At least 22 GB free on the profile's disk (the model is removed if free space drops below 10 GB after download).
- More than 4 GB of GPU VRAM, or 16 GB RAM and 4+ CPU cores.
- An unmetered connection for the one-time model download.

`LanguageModel.availability()` returns `"unavailable"` on hardware that does not qualify; the panel then says so and uses the scripted agent. When it returns `"downloadable"`, a **Download model** button appears (the download needs a click). WebMCP itself needs native support from Chrome's WebMCP trial/flag (`chrome://flags/#enable-webmcp-testing`) or falls back to the polyfill.

Chrome 157 on a machine that cannot run the model reports `unavailable`, so the scripted agent is what you get there.

## Tests

`pnpm test` covers the agent loop against a stubbed `LanguageModel` and the scripted path end to end on this page (`test/demo-agent.test.ts`). It never loads a real model.
