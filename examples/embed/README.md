# Embed example

Uses the engine directly. `app.js` creates a tour, registers an app tool of its own, and registers the tour tools under custom names. No bundler: the page imports `/dist/index.js`.

```sh
pnpm example:embed    # http://localhost:5173/   (native WebMCP, else the polyfill loads by itself; ?webmcp=native|polyfill overrides)
```

What to look at in `app.js`:

- `change_plan` stages a plan change in the UI, then calls `tour.show({ target: "confirm-plan", … })` inside `execute`. It returns `{ staged: true, pointed: true }`: the user still clicks Confirm.
- `createTour({ names })` gives the tour tools `settings_point_at`, `settings_list_controls`, `settings_clear_point` and `settings_wait_for_click`; `registerAsWebMcpTool(tour)` registers them.

## Try asking

1. "Switch us to the Business plan."
2. "Downgrade to Starter, please."
3. "Where do I download invoices?"
4. "Change the plan to Enterprise." (not a valid plan: expect an error, no highlight)
5. "I clicked confirm: what is our current plan?" (ask after confirming)
