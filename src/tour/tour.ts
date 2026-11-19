import { Overlay } from "../engine/overlay/index.js";
import type { OverlayEvents, OverlayOptions } from "../engine/overlay/index.js";
import type { TargetInfo } from "../engine/resolver/index.js";
import { describe, isVisible, listTargets, locate, locationOf, reveal } from "../engine/resolver/index.js";
import type { ResolveInput, ResolverOptions } from "../engine/resolver/index.js";
import { defineTools } from "../tools/definitions.js";
import { MAX_MESSAGE, MAX_TITLE } from "./limits.js";
import { Pages } from "./pages.js";
import { drop, peek, stash, strip } from "./resume.js";
import type { Pending } from "./resume.js";
import { Targets } from "./targets.js";
import type { DismissResult, PageInfo, StepInput, StepResult, Tour, TourEvents, TourOptions, WaitEvent, WaitInput, WaitOptions, WaitResult } from "./types.js";
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

const MAX_LIST = 50;
const pick = ({ target, selector, text, index }: ResolveInput): ResolveInput => ({
  ...(target !== undefined && { target }),
  ...(selector !== undefined && { selector }),
  ...(text !== undefined && { text }),
  ...(index !== undefined && { index }),
});

function build(options: TourOptions): Tour {
  const { scope, exclude, locators, pages: initialPages, navigate, pageSuggestion, resume: resumeOpt, ...rest } = options;
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
  if (rest.labels) overlayOptions.labels = rest.labels;
  if (rest.takeMeThere) overlayOptions.takeMeThere = true;
  if (pageSuggestion?.placement === "corner") overlayOptions.noticePlacement = "corner";
  if (rest.describeTarget) overlayOptions.describeTarget = true;
  const overlay = new Overlay(overlayOptions);
  overlay.mount(); // the live region exists from load; no-op headless or without a document
  const pages = new Pages();
  const targets = new Targets(() => pages.current()?.id);
  let suggestion: (Pending & { url: string }) | undefined; // the page suggestion on screen: Go navigates, nothing else does
  let resumed: { page: string; target?: string } | undefined; // told to the agent once, on its next result
  let resuming: Promise<void> | undefined; // a resume waiting for its target to appear
  let stopResume: (() => void) | undefined;
  const param = resumeOpt === false ? undefined : (resumeOpt?.param || "webmcp-tour");
  let pending: ((r: WaitResult) => void) | undefined; // the wait in flight, if any
  let anchor: ResolveInput | undefined; // how the current step was located
  const supersede = () => pending?.({ ok: true, status: "superseded" });
  const ropts = (): ResolverOptions => ({ targets, overlayHost: overlay.host, scope, exclude });
  const off = (step: ResolveInput): Invalid | undefined => {
    for (const k of ["selector", "text"] as const)
      if (step[k] !== undefined && locators?.[k] === false) return invalid(`The ${k} locator is turned off on this page.`);
  };

  const info = (p: { id: string; title: string }): PageInfo => ({ id: p.id, title: p.title });
  overlay.on("dismiss", ({ reason }) => {
    const s = suggestion;
    suggestion = undefined;
    if (reason === "acknowledged") pending?.({ ok: true, status: "acknowledged" });
    else if (s && reason === "declined") pending?.({ ok: true, status: "dismissed" });
    else if (s && reason === "navigating") {
      pending?.({ ok: true, status: "navigating" });
      const kept = param ? stash(s, s.url, param) : undefined;
      try {
        (navigate ?? ((url: string) => location.assign(url)))(kept?.url ?? s.url);
      } catch {
        // The app's router failing must not break the tour.
      }
      // A single-page app is still here and shows the step once its target appears; a full load starts over in the new page.
      if (kept) resuming = resume(kept.nonce, false);
    }
  });
  /** The visible element marked `data-tour-page="<id>"` (not a target itself), for the anchored card. */
  const anchorOf = (id: string): Element | undefined =>
    [...document.querySelectorAll(`[data-tour-page="${CSS.escape(id)}"]:not([data-tour-id])`)].find(
      (e) => !overlay.host?.contains(e) && (!scope || scope.contains(e)) && !(exclude && e.closest(exclude)) && !e.closest("[data-tour-exclude]") && isVisible(e),
    );
  /** Show the suggestion card for `page`; the caller builds the envelope. */
  const suggest = (page: { id: string; url: string; title: string }, title: string | undefined, target?: string, message?: string): boolean => {
    const a = pageSuggestion?.placement === "anchor" ? anchorOf(page.id) : undefined;
    if (!overlay.notice({ page: page.title, ...(title ? { title } : {}), anchor: a }).shown) return false;
    suggestion = { page: page.id, url: page.url, target, title, message };
    anchor = undefined;
    supersede();
    return true;
  };
  const obscured = (): StepResult => ({ ok: false, error: "obscured", message: "A modal dialog is open; the page behind it cannot be pointed at." });

  /**
   * Show the step stored under `nonce` once its target is on the page (a mutation, a definition, or 5 s, whichever ends it).
   * `consume`: a load takes the entry for good; after `navigate()` it is only dropped on success, since a full page load
   * is about to unload this page and the new one needs it.
   */
  const resume = (nonce: string, consume: boolean): Promise<void> => {
    const s = peek(nonce);
    if (consume || !s) drop(nonce);
    if (!s) return (strip(param!, nonce), Promise.resolve());
    return new Promise<void>((resolve) => {
      let over = false;
      const mo = new MutationObserver(() => void attempt());
      const subs = [targets.onChange(() => void attempt()), pages.onChange(() => void attempt())];
      const timer = setTimeout(() => finish(), 5000);
      const finish = (ok?: boolean): void => {
        if (over) return;
        over = true;
        mo.disconnect();
        subs.forEach((off) => off());
        clearTimeout(timer);
        if (ok) drop(nonce);
        strip(param!, nonce);
        stopResume = resuming = undefined;
        resolve();
      };
      const attempt = async (): Promise<void> => {
        if (over) return;
        if (s.target === undefined) {
          if (pages.get(s.page) === pages.current()) (resumed = { page: s.page }), finish(true);
        } else if (!targets.offPage(s.target)) {
          const r = await tour.show({ target: s.target, title: s.title, message: s.message } as StepInput);
          if (r.ok && !over) (resumed = { page: s.page, target: s.target }), finish(true);
        }
      };
      stopResume = finish;
      mo.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class", "open", "data-tour-id"] });
      void attempt();
    });
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

      if (step.page !== undefined) {
        if (typeof step.page !== "string" || !step.page.trim()) return invalid("page must be a non-empty string.");
        if (step.target !== undefined || step.selector !== undefined || step.text !== undefined) return invalid("Provide exactly one of target, selector, text or page.");
        const p = pages.get(step.page);
        if (!p) return { ok: false, error: "page_not_found", available: pages.all().map((x) => x.id) };
        if (p === pages.current()) return invalid("The user is already on that page.");
        return suggest(p, title, undefined, message) ? { ok: true, suggested: info(p) } : obscured();
      }
      const away = typeof step.target === "string" ? targets.offPage(step.target) : undefined;
      const awayPage = away && pages.get(away.page);
      if (awayPage) {
        if (!suggest(awayPage, title, step.target, message)) return obscured();
        return { ok: false, error: "other_page", page: info(awayPage), message: `That control is on ${awayPage.title}. The user was asked whether to go; nothing moved.` };
      }

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
      if (!shown.shown) return obscured();
      suggestion = undefined;
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
      if (!Object.keys(loc).length && !overlay.target) await resuming; // a resume in flight lands first
      const asked = !Object.keys(loc).length && !!suggestion && !!overlay.target; // waiting on the suggestion card, not an element
      if (!Object.keys(loc).length && !asked) {
        if (!overlay.target || !anchor) return { ok: false, error: "no_step", message: "Nothing is highlighted. Point at an element first, or name the one to wait for." };
        loc = anchor;
      }
      const found = asked ? { ok: true as const, element: overlay.target! } : locate(loc, ropts());
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
        asked ? [] : (events ?? [defaultEvent(found.element) as WaitEvent]),
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
      if (type === "targets") {
        const offs = [targets.onChange(fn as () => void), pages.onChange(fn as () => void)];
        return () => offs.forEach((off) => off());
      }
      return overlay.on(type as keyof OverlayEvents, fn as never);
    },

    targets() {
      const here = listTargets({ targets, overlayHost: overlay.host, scope, exclude });
      const current = pages.current();
      const text = (v: string | undefined, n: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
      const away: TargetInfo[] = targets.allOffPage().flatMap((t) => {
        const p = pages.get(t.page);
        if (!p) return [];
        const label = text(t.label, 80) || t.id;
        const description = text(t.description, 300);
        return [{ id: t.id.slice(0, 80), label, ...(description ? { description } : {}), visible: false, page: info(p), onThisPage: false as const }];
      });
      const others = pages.all().filter((p) => p !== current).map((p) => ({ ...info(p), ...(p.description ? { description: text(p.description, 200) } : {}) }));
      return {
        targets: [...here.targets, ...away].slice(0, MAX_LIST),
        total: here.total + away.length,
        ...(current ? { page: info(current) } : {}),
        ...(others.length ? { pages: others } : {}),
      };
    },

    definePage: (def) => pages.define(def),

    page: () => {
      const p = pages.current();
      return p && info(p);
    },

    tools: (opts) => defineTools(tour, opts?.names),

    defineTarget: (def) => targets.define(def),

    takeResumed() {
      const r = resumed;
      resumed = undefined;
      return r;
    },

    destroy(): void {
      stopResume?.();
      supersede();
      overlay.destroy();
      const slot = globalThis as Slot;
      if (slot[KEY] === tour) delete slot[KEY];
    },
  };
  for (const p of initialPages ?? []) pages.define(p);
  const nonce = param && typeof document !== "undefined" ? new URLSearchParams(location.search).get(param) : null;
  if (nonce) resuming = resume(nonce, true);
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
