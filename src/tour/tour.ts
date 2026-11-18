import { Overlay } from "../engine/overlay/index.js";
import type { OverlayEvents, OverlayOptions } from "../engine/overlay/index.js";
import { describe, listTargets, locate, locationOf, reveal } from "../engine/resolver/index.js";
import type { ResolveInput, ResolverOptions } from "../engine/resolver/index.js";
import { defineTools } from "../tools/definitions.js";
import { MAX_MESSAGE, MAX_TITLE } from "./limits.js";
import { Targets } from "./targets.js";
import type { DismissResult, StepInput, StepResult, Tour, TourEvents, TourOptions, WaitEvent, WaitInput, WaitOptions, WaitResult } from "./types.js";
import { WAIT_MS, defaultEvent, watch } from "./wait.js";

export { MAX_MESSAGE, MAX_TITLE };
const KEY = Symbol.for("webmcp-tour");
const PLACEMENTS = ["auto", "above", "below"];

type Slot = { [KEY]?: Tour };
type Invalid = { ok: false; error: "invalid_input"; message: string };
const invalid = (message: string): Invalid => ({ ok: false, error: "invalid_input", message });

function text(value: unknown, name: string, max: number): string | Invalid | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return invalid(`${name} must be a string.`);
  if (value.length > max) return invalid(`${name} is over ${max} characters.`);
  return value.trim() || undefined;
}

const pick = ({ target, selector, text, index }: ResolveInput): ResolveInput => ({
  ...(target !== undefined && { target }),
  ...(selector !== undefined && { selector }),
  ...(text !== undefined && { text }),
  ...(index !== undefined && { index }),
});

function build(options: TourOptions): Tour {
  const { scope, exclude, locators, ...rest } = options;
  if (exclude !== undefined && typeof document !== "undefined") {
    try {
      document.createDocumentFragment().querySelector(exclude);
    } catch {
      throw new TypeError("webmcp-tour: invalid `exclude` selector");
    }
  }
  const overlayOptions: OverlayOptions = {};
  if (rest.render !== undefined) overlayOptions.render = rest.render;
  if (rest.renderPopover) overlayOptions.renderPopover = rest.renderPopover;
  if (rest.attribution !== undefined) overlayOptions.attribution = rest.attribution;
  if (rest.describeTarget) overlayOptions.describeTarget = true;
  const overlay = new Overlay(overlayOptions);
  overlay.mount(); // the live region exists from load; no-op headless or without a document
  const targets = new Targets();
  let pending: ((r: WaitResult) => void) | undefined; // the wait in flight, if any
  let anchor: ResolveInput | undefined; // how the current step was located
  const supersede = () => pending?.({ ok: true, status: "superseded" });
  const ropts = (): ResolverOptions => ({ targets, overlayHost: overlay.host, scope, exclude });
  const off = (step: ResolveInput): Invalid | undefined => {
    for (const k of ["selector", "text"] as const)
      if (step[k] !== undefined && locators?.[k] === false) return invalid(`The ${k} locator is turned off on this page.`);
  };

  const tour: Tour = {
    async show(step: StepInput): Promise<StepResult> {
      if (typeof document === "undefined") return { ok: false, error: "unavailable", message: "There is no document to point at." };
      if (!step || typeof step !== "object") return invalid("A step must be an object.");
      const { placement } = step;
      if (placement !== undefined && !PLACEMENTS.includes(placement)) return invalid("placement must be auto, above or below.");
      const blocked = off(step);
      if (blocked) return blocked;
      const title = text(step.title, "title", MAX_TITLE);
      if (typeof title === "object") return title;
      let message = text(step.message, "message", MAX_MESSAGE);
      if (typeof message === "object") return message;

      const found = locate(step, ropts());
      if (!found.ok) return found;
      if (message === undefined && found.matched.by === "target") {
        const d = targets.get(step.target!)?.description?.trim();
        if (d) message = d.slice(0, MAX_MESSAGE);
      }
      if (message === undefined) return invalid("message is required unless the target is declared with a description.");

      const seen = reveal(found.element);
      const where = locationOf(found.element);
      const announcement = `${message} — ${where.name || found.matched.tag}${where.landmark ? `, ${where.landmark}` : ""}`;
      const shown = overlay.show(found.element, { title: title ?? "", message, announcement, ...(placement ? { placement } : {}) });
      if (!shown.shown) return { ok: false, error: "obscured", message: "A modal dialog is open; the page behind it cannot be pointed at." };
      anchor = pick(step);
      supersede();
      return { ok: true, matched: { ...found.matched, ...seen } };
    },

    async waitForInteraction(input: WaitInput = {}, options: WaitOptions = {}): Promise<WaitResult> {
      if (typeof document === "undefined") return { ok: false, error: "unavailable", message: "There is no document to watch." };
      if (!input || typeof input !== "object") return invalid("The input must be an object.");
      const { events, ...named } = input;
      if (events !== undefined && !(Array.isArray(events) && events.length && events.every((e) => e === "click" || e === "change")))
        return invalid("events must be a non-empty list of click or change.");
      const blocked = off(named);
      if (blocked) return blocked;
      let loc = pick(named);
      if (!Object.keys(loc).length) {
        if (!overlay.target || !anchor) return { ok: false, error: "no_step", message: "Nothing is highlighted. Point at an element first, or name the one to wait for." };
        loc = anchor;
      }
      const found = locate(loc, ropts());
      if (!found.ok) return found;
      const { signal, timeoutMs = WAIT_MS } = options;
      if (signal?.aborted) return { ok: false, error: "cancelled", message: "The call was cancelled." };
      supersede();
      const w = watch(
        found.element,
        () => {
          const again = locate(loc, ropts());
          return again.ok ? again.element : null;
        },
        events ?? [defaultEvent(found.element) as WaitEvent],
        (el) => {
          const m = describe("selector", el, ropts());
          return { tag: m.tag, name: m.name };
        },
        signal,
        timeoutMs,
      );
      pending = w.settle;
      const result = await w.done;
      if (pending === w.settle) pending = undefined;
      return result;
    },

    dismiss(): DismissResult {
      overlay.hide();
      return { ok: true, dismissed: true };
    },

    on<K extends keyof TourEvents>(type: K, fn: (e: TourEvents[K]) => void): () => void {
      if (type === "targets") return targets.onChange(fn as () => void);
      return overlay.on(type as keyof OverlayEvents, fn as never);
    },

    targets: () => listTargets({ targets, overlayHost: overlay.host, scope, exclude }),

    tools: (opts) => defineTools(tour, opts?.names),

    defineTarget: (def) => targets.define(def),

    destroy(): void {
      supersede();
      overlay.destroy();
      const slot = globalThis as Slot;
      if (slot[KEY] === tour) delete slot[KEY];
    },
  };
  return tour;
}

/**
 * The tour for this document. One per document: later calls return the
 * first instance, so a script tag and a bundle share one overlay. Options
 * only apply to the call that creates it. Touches no DOM until used.
 */
export function createTour(options: TourOptions = {}): Tour {
  const slot = globalThis as Slot;
  const existing = slot[KEY];
  if (existing) {
    if (Object.keys(options).length) console.warn("webmcp-tour: a tour already exists on this page; the options passed to createTour() were ignored.");
    return existing;
  }
  return (slot[KEY] = build(options));
}
