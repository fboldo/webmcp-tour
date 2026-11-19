# Bundled example

A small Vite SPA (Dashboard, Projects, Settings) with client-side routes. `src/main.ts` imports `webmcp-tour/auto` from the root package through the workspace link (it needs the root build, which the script runs).

```sh
pnpm example:bundled    # http://localhost:5173/   (add ?polyfill for in-page testing)
```

The app declares its three routes with `pages` and passes `navigate` (the SPA router), so the agent knows where controls live. Ask for "Create API token" from the Dashboard: the agent gets `other_page`, a card offers **Go to Settings** / **Not now**, and only the user's click navigates. After Go the tour resumes the step on the new route (the control is highlighted without asking again); the agent stays alive because the page never reloads (a full page load would restart an embedded agent).

## Try asking

1. "How do I start a new project?" (from the Dashboard: expect the Go to Projects card)
2. "Show me where to create an API token." (it sits under Developer options on Settings: expect a reveal hint)
3. "Where do I turn off the daily email digest?"
4. "Point me at the View report button."
5. "Which settings can you show me on this page?"
