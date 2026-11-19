# Try-it demo

A fake settings app (Acme Cloud) with the tour tools registered, a control panel that drives `window.webmcpTour` by hand, and an **Ask the assistant** panel: a small in-page agent that picks tour tools to answer "how do I…?" and shows every tool call and result in a transcript.

```sh
pnpm demo        # builds, then serves http://127.0.0.1:4173/demo/  (PORT overrides)
```

`http://localhost` counts as a secure context; WebMCP needs one. Where Chrome has no native WebMCP, the page loads the W3C polyfill (a dev dependency, served only by the demo server) to provide `document.modelContext`.

## The fake app

A small single-page app with four pages (**Billing**, **Team**, **Security**, **Notifications**), one visible at a time, routed with `history.pushState` (`/demo/billing`, …; `pnpm demo` serves any `/demo/<page>` as the app). `demo/tour.js` creates the tour with `pages` and a `navigate` that swaps the visible page, so nothing reloads and the in-page agent keeps running. Each declared target says which page it is on (`data-tour-page`).

Try it: on Billing, ask "How do I set up two-factor?". The agent answers `other_page` and a card appears: **Go to Security** / **Not now**. Nothing moves until you click Go. After Go the app switches to Security and the tour **resumes** the step there: **Set up two-factor** is highlighted without asking again. Only a random nonce (`?webmcp-tour=…`) goes through the URL while it happens; the step itself waits in `sessionStorage` and the parameter is removed once the step shows. The suggestion card is centred in the viewport (the default `pageSuggestion.placement`).

The controls work, so guidance can span several steps: **Change plan** opens a plan picker (a modal `<dialog>` with declared targets `plan-options` and `plan-confirm`) and **Confirm** updates the plan shown under Billing; **Download invoices** shows a confirmation toast; Security → **Set up two-factor** opens a setup step (`two-factor-code`); **Help** opens a fake chat (`chat-input`). The overlay mounts inside an open modal, so it can point at the picker's controls.

## The assistant

Four modes, picked from the **Mode** menu (default **Auto**). The status line above the transcript always says which one is running.

| Mode | What runs | Needs |
|---|---|---|
| **Scripted demo** | A handful of canned question → tool-call mappings. No AI model; answers are fixed text. The tool calls are real. | Nothing. Used automatically when the Prompt API is missing or its model unavailable. `?agent=scripted` pins it. |
| **Model, JSON-constrained** | Chrome's Prompt API (`LanguageModel`, Gemini Nano). The model replies `{ tool, args, answer }` under a `responseConstraint` JSON Schema; the page calls the tool through `document.modelContext.executeTool` and feeds the result back, until the model sends `final_answer` (8 steps at most). | Prompt API + the on-device model. |
| **OpenRouter** | Your OpenRouter API key and a model of your choice. The page maps the registered WebMCP tools to OpenAI-style `tools`, calls the ones the model asks for through `document.modelContext.executeTool`, sends the results back, and loops to a final answer (8 steps at most). **Stop** aborts the request. | An [OpenRouter](https://openrouter.ai) API key (see below). |
| **Model, native tool use** | The page's registered tools are passed to `LanguageModel.create({ tools })` and Chrome runs the loop. | As above, plus `chrome://flags/#prompt-api-tool-use` set to Enabled. If the session cannot be created with tools, the page falls back to the JSON-constrained mode and says so in the transcript. |

**Auto** uses the JSON-constrained mode when a model is available (it works without the tool-use flag), else OpenRouter when a key is entered, else the scripted agent. It never calls OpenRouter without a key. Pick native tool use explicitly to try the flag.

### OpenRouter

Open **OpenRouter settings** under the Mode menu (or pick the OpenRouter mode), paste a key from [openrouter.ai/keys](https://openrouter.ai/keys) and choose a model. The point of the demo is that even a weak model picks the right tools, so the default is `meta-llama/llama-3.1-8b-instruct` (8B, about $0.02 / $0.04 per million tokens) and the picker lists a few other small or free models that support tool calling, plus **Other…** for any model id. Ids and tool support come from `https://openrouter.ai/api/v1/models`; free models are rate-limited.

- The key stays in this browser: it is held in memory, and only stored in `localStorage` if you tick **Remember on this device**. **Forget key** clears both. It is sent only to `https://openrouter.ai/api/v1/chat/completions` (as `Authorization: Bearer`, with `HTTP-Referer` and `X-Title`), never in a URL, the transcript or the console. Use a key with a spending limit.
- If a model rejects `tools`, the page retries with JSON replies (`response_format: json_object`, then plain prompting) and says so in the transcript.
- 401 (bad key), 402 (no credits) and 429 (rate limit) show a plain message in the transcript.

### Requirements for the on-device model

From the [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api):

- Desktop Chrome (Windows 10/11, macOS 13+, Linux, or a Chromebook Plus). Not Android or iOS.
- At least 22 GB free on the profile's disk (the model is removed if free space drops below 10 GB after download).
- More than 4 GB of GPU VRAM, or 16 GB RAM and 4+ CPU cores.
- An unmetered connection for the one-time model download.

`LanguageModel.availability()` returns `"unavailable"` on hardware that does not qualify; the panel then says so and uses the scripted agent. When it returns `"downloadable"`, a **Download model** button appears (the download needs a click). WebMCP itself needs native support from Chrome's WebMCP trial/flag (`chrome://flags/#enable-webmcp-testing`) or falls back to the polyfill.

Chrome 157 on a machine that cannot run the model reports `unavailable`, so the scripted agent is what you get there.

A malformed model reply (bad JSON, bad `args`) never ends the run: the model gets a short corrective message and tries again, counting toward the 8-step cap. When the cap is hit, the final message says what was highlighted last.

## Tests

`pnpm test` covers the agent loop against a stubbed `LanguageModel` and the scripted path end to end on this page (`test/demo-agent.test.ts`), and the OpenRouter mode against a stubbed `fetch` (`test/demo-openrouter.test.ts`). It never loads a real model or touches the network.
