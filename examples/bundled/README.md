# Bundled example

A small Vite SPA (Dashboard, Projects, Settings) with client-side routes. `src/main.ts` imports `webmcp-tour/auto` from the root package through the workspace link (it needs the root build, which the script runs).

```sh
pnpm example:bundled    # http://localhost:5173/   (add ?polyfill for in-page testing)
```

Targets come and go with the route: `tour_list_targets` is registered only while the current route declares targets, so it is absent on the Dashboard and present on Projects and Settings. Switch routes and ask the agent to list its tools again.

## Try asking

1. "How do I start a new project?" (go to Projects first, or let the agent say where it is)
2. "Show me where to create an API token." (it sits under Developer options on Settings: expect a reveal hint)
3. "Where do I turn off the daily email digest?"
4. "Point me at the View report button."
5. "Which settings can you show me on this page?"
