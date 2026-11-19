# Framework recipes

Rule for all of them: `createTour(options)` returns a new tour with its own options, and `registerAsWebMcpTool(tour)` registers its four tools. Create one tour per app (several tours share the screen and need distinct tool names: `toolPrefix` or `names`).

## Plain HTML

Script tag with a pinned version and SRI (see SKILL.md), then markup attributes. For pages or labels, either put them in a `<script type="application/json" id="tour-config">` block and add `data-config="tour-config"` to the script tag, or use a module (needed for `navigate`):

```html
<script type="module">
  import { createTour, registerAsWebMcpTool } from "https://unpkg.com/webmcp-tour@0.1.0/dist/index.js";
  const tour = createTour({ pages: [{ id: "billing", url: "/billing.html", title: "Billing" }, { id: "security", url: "/security.html", title: "Security" }] });
  registerAsWebMcpTool(tour);
</script>
```

Multi-page sites reload on **Go**; the highlight still resumes on the next page (the nonce), but an agent embedded in the page restarts.

## React / Vite

Declarative markup works as is (`data-tour-*` props pass through to the DOM). Set up once, at module level of your entry file (client only):

```tsx
// src/tour.ts, imported from main.tsx
import { createTour, registerAsWebMcpTool } from "webmcp-tour";
import { router } from "./router";

export const tour = createTour({
  pages: [{ id: "billing", url: "/billing", title: "Billing" }],
  navigate: (url) => router.navigate(url),
  labels: { gotIt: "Entendi" },
});
await registerAsWebMcpTool(tour);
```

Declare a target from a component when the element is not yours to mark up, and clean up (Strict Mode runs effects twice):

```tsx
useEffect(() => tour.defineTarget({ id: "chat", selector: "#chat-input", description: "Type your question here." }), []);
```

`defineTarget` returns the remover, so returning it from the effect is the cleanup.

## Next.js (App Router)

`webmcp-tour` is SSR-safe to import (no DOM at import time), but create the tour on the client only:

```tsx
// app/tour-client.tsx
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function TourClient() {
  const router = useRouter();
  const push = useRef((url: string) => router.push(url));
  push.current = (url) => router.push(url);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let tour: { destroy(): void } | undefined;
    void import("webmcp-tour").then(async ({ createTour, registerAsWebMcpTool }) => {
      const t = createTour({ pages: [{ id: "billing", url: "/billing", title: "Billing" }], navigate: (url) => push.current(url) });
      tour = t;
      stop = (await registerAsWebMcpTool(t)).unregister;
    });
    return () => (stop?.(), tour?.destroy());
  }, []);
  return null;
}
```

Render `<TourClient />` in the root layout, so it mounts once. With the Pages Router, put the same effect in `_app.tsx` (`next/router`). Without options, load the script-tag build in a client component instead.

If a route change keeps the tour alive, do not unregister per page; do it only on full teardown.

## Vue / Nuxt

```ts
// main.ts (Nuxt: a client-only plugin, plugins/tour.client.ts)
import { createTour, registerAsWebMcpTool } from "webmcp-tour";
const tour = createTour({ pages: [...], navigate: (url) => router.push(url) });
await registerAsWebMcpTool(tour);
```

In a component: `onMounted(() => { off = tour.defineTarget({...}) }); onBeforeUnmount(() => off?.())`. `data-tour-*` attributes work in templates.

## Engine embed (own tools plus own names)

```ts
import { createTour, getModelContext, registerAsWebMcpTool } from "webmcp-tour";
const tour = createTour({ names: { showStep: "settings_point_at", listTargets: "settings_list_controls", dismiss: "settings_clear_point", waitForInteraction: "settings_wait_for_click" } });
const mc = getModelContext(); // null (with one console.info) where WebMCP is missing
if (mc) {
  await mc.registerTool(myAppTool); // calls tour.show(...) inside execute
  await registerAsWebMcpTool(tour); // the four tour tools, under the names above
}
```

Do not also load the script tag (it would register the standard tools a second time under the default names).
