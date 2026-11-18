import type { WaitEvent, WaitResult } from "./types.js";

/** Deadline held by the wait itself: shorter than the 30 s some hosts cut at without aborting. */
export const WAIT_MS = 20_000;

const BUTTONISH = /^(button|submit|reset|image|checkbox|radio|file|color|range)$/i;
const TYPES: Record<WaitEvent, string[]> = { click: ["pointerdown", "click"], change: ["change"] };

/** Buttons and links finish on `click`; fields finish on `change`. Never `input`: the first keystroke is not the step. */
export function defaultEvent(el: Element): WaitEvent {
  const { tagName } = el;
  return tagName === "SELECT" || tagName === "TEXTAREA" || (tagName === "INPUT" && !BUTTONISH.test((el as HTMLInputElement).type)) ? "change" : "click";
}

/**
 * Listen on `window` in the capture phase, so the app's own handlers (and
 * `stopPropagation`) cannot hide the event, and re-resolve the target on every
 * event, so a re-render cannot strand the listener on a detached node. Only
 * trusted events count; script-made ones (`el.click()`) are ignored. The result
 * names the element, never a value. Everything is released on the first of:
 * interaction, deadline, `settle` (supersede) or abort.
 */
export function watch(
  first: Element,
  find: () => Element | null | undefined,
  events: WaitEvent[],
  name: (el: Element) => { tag: string; name: string },
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { done: Promise<WaitResult>; settle(r: WaitResult): void } {
  let settle!: (r: WaitResult) => void;
  const done = new Promise<WaitResult>((resolve) => {
    const types = [...new Set(events.flatMap((e) => TYPES[e]))];
    const on = (e: Event) => {
      if (!e.isTrusted || (e.type === "pointerdown" && (e as PointerEvent).button !== 0)) return;
      const path = e.composedPath();
      const el = first.isConnected && path.includes(first) ? first : find();
      if (!el || !path.includes(el) || el.matches(":disabled")) return;
      settle({ ok: true, status: "interacted", event: e.type === "change" ? "change" : "click", target: name(el) });
    };
    const abort = () => settle({ ok: false, error: "cancelled", message: "The call was cancelled." });
    const timer = setTimeout(() => settle({ ok: true, status: "timeout" }), timeoutMs);
    let over = false;
    settle = (r) => {
      if (over) return;
      over = true;
      for (const t of types) window.removeEventListener(t, on, true);
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(r);
    };
    for (const t of types) window.addEventListener(t, on, true);
    signal?.addEventListener("abort", abort, { once: true });
  });
  return { done, settle };
}
