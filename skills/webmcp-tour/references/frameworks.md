# Framework recipes

Rule for all of them: one tour per document, and its options come from the first `createTour(options)` call. With options, create the tour first, then call `registerAutoTools()`; do not also import `webmcp-tour/auto`. Without options, `import "webmcp-tour/auto"` alone is enough.

## Plain HTML

Script tag with a pinned version and SRI (see SKILL.md), then markup attributes. For pages or labels, use a module instead of the script tag:

```html
<script type="module">
  import { createTour, registerAutoTools } from "https://unpkg.com/webmcp-tour@<VERSION>/dist/index.js";
  createTour({ pages: [{ id: "billing", url: "/billing.html", title: "Billing" }, { id: "security", url: "/security.html", title: "Security" }] });
  registerAutoTools();
</script>
```

Multi-page sites reload on **Go**; the highlight still resumes on the next page (the nonce), but an agent embedded in the page restarts.

## React / Vite

Declarative markup works as is (`data-tour-*` props pass through to the DOM). Set up once, at module level of your entry file (client only):

```tsx
// src/tour.ts, imported from main.tsx
import { createTour, registerAutoTools } from "webmcp-tour";
import { router } from "./router";

export const tour = createTour({
  pages: [{ id: "billing", url: "/billing", title: "Billing" }],
  navigate: (url) => router.navigate(url),
  labels: { gotIt: "Entendi" },
});
registerAutoTools();
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
    void import("webmcp-tour").then(({ createTour, registerAutoTools }) => {
      createTour({ pages: [{ id: "billing", url: "/billing", title: "Billing" }], navigate: (url) => push.current(url) });
      stop = registerAutoTools().stop;
    });
    return () => stop?.();
  }, []);
  return null;
}
```

Render `<TourClient />` in the root layout, so it mounts once. With the Pages Router, put the same effect in `_app.tsx` (`next/router`). Without options, a single `import "webmcp-tour/auto"` inside a client component is enough.

If a route change keeps the tour alive, do not call `stop()` per page; call it only on full teardown.

## Vue / Nuxt

```ts
// main.ts (Nuxt: a client-only plugin, plugins/tour.client.ts)
import { createTour, registerAutoTools } from "webmcp-tour";
createTour({ pages: [...], navigate: (url) => router.push(url) });
registerAutoTools();
```

In a component: `onMounted(() => { off = tour.defineTarget({...}) }); onBeforeUnmount(() => off?.())`. `data-tour-*` attributes work in templates.

## Engine embed (own tools plus own names)

```ts
import { createTour, getModelContext } from "webmcp-tour";
const tour = createTour();
const mc = getModelContext(); // null (with one console.info) where WebMCP is missing
if (mc) {
  await mc.registerTool(myAppTool); // calls tour.show(...) inside execute
  for (const def of tour.tools({ names: { showStep: "settings_point_at", listTargets: "settings_list_controls", dismiss: "settings_clear_point", waitForInteraction: "settings_wait_for_click" } })) await mc.registerTool(def);
}
```

Do not also load `registerAutoTools` (you would register the standard tools twice under different names).
