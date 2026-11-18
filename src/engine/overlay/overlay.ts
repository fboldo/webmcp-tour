// Overlay: spotlight + card, drawn in the top layer inside an open shadow
// root. Takes an Element; no resolver logic. See the plan's Theme section.

import { createSheet } from "../theme/index.js";
import { clearFixed, drift, isClipped, placeFixed } from "./position.js";
import type {
  DismissReason,
  OverlayEvents,
  OverlayOptions,
  OverlayStep,
  Placement,
  RenderStep,
  ShowResult,
} from "./types.js";

type Parts = { host: HTMLElement; root: ShadowRoot; ring: HTMLElement; card: HTMLElement };

function supportsAnchor(): boolean {
  return (
    typeof CSS !== "undefined" &&
    CSS.supports("position-anchor: auto") &&
    CSS.supports("position-try-fallbacks: flip-block") &&
    typeof HTMLElement.prototype.showPopover === "function"
  );
}

function part<K extends keyof HTMLElementTagNameMap>(tag: K, name: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.setAttribute("part", name);
  return e;
}

/** The open modal dialog containing `el`, crossing shadow boundaries. */
function modalAncestor(el: Element): Element | null {
  for (let n: Node | null = el; n; n = n.parentNode ?? (n as ShadowRoot).host ?? null)
    if (n instanceof Element && n.matches("dialog:modal")) return n;
  return null;
}

export class Overlay {
  readonly #opts: OverlayOptions;
  readonly #listeners: { [K in keyof OverlayEvents]: Set<(e: OverlayEvents[K]) => void> } = {
    show: new Set(),
    dismiss: new Set(),
  };
  #parts: Parts | undefined;
  #defaults: { attribution: HTMLElement; title: HTMLElement; message: HTMLElement; card: HTMLElement } | undefined;
  #target: Element | undefined;
  #card: HTMLElement | undefined; // the card in use: default or the hook's
  #placement: Placement = "auto";
  #fixed = false;
  #modal: Element | null = null; // the dialog we are mounted in
  #raf = 0;
  #ro: ResizeObserver | undefined;
  #mo: MutationObserver | undefined;
  #anchorOk: boolean | undefined;

  constructor(options: OverlayOptions = {}) {
    this.#opts = options;
  }

  /** The element currently pointed at, if any. */
  get target(): Element | undefined {
    return this.#target;
  }

  /** The shadow host, once something has been shown (undefined when headless). */
  get host(): HTMLElement | undefined {
    return this.#parts?.host;
  }

  on<K extends keyof OverlayEvents>(type: K, fn: (e: OverlayEvents[K]) => void): () => void {
    this.#listeners[type].add(fn);
    return () => void this.#listeners[type].delete(fn);
  }

  #emit<K extends keyof OverlayEvents>(type: K, e: OverlayEvents[K]): void {
    for (const fn of [...this.#listeners[type]]) {
      try {
        fn(e);
      } catch (err) {
        queueMicrotask(() => {
          throw err; // a listener's bug must not break the overlay
        });
      }
    }
  }

  show(target: Element, step: OverlayStep = {}): ShowResult {
    if (this.#target) this.#end("superseded");
    const modal = modalAncestor(target);
    // Everything outside an open modal is inert: pointing there is pointless.
    if (!modal && document.querySelector("dialog:modal"))
      return { shown: false, positioning: "none", reason: "obscured" };

    const title = step.title ?? "";
    const message = step.message ?? "";
    this.#placement = step.placement ?? "auto";
    this.#target = target;
    this.#modal = modal;
    let positioning: ShowResult["positioning"] = "none";

    if (this.#opts.render !== false) {
      const p = (this.#parts ??= this.#build());
      this.#fill(target, title, message);
      // The overlay lives inside the modal so it is not inert.
      const mount = modal ?? document.body ?? document.documentElement;
      if (p.host.parentNode !== mount) mount.append(p.host);
      // Chromium remembers the last position-try fallback; re-inserting resets it.
      const card = this.#card!;
      p.root.append(p.ring, card);
      this.#anchorOk ??= (this.#opts.positioning ?? "auto") === "auto" ? supportsAnchor() : this.#opts.positioning === "anchor";
      this.#fixed = !this.#anchorOk;
      this.#mode(p, card);
      for (const e of [p.ring, card])
        e.showPopover(this.#fixed ? undefined : { source: target as HTMLElement });
      if (!this.#fixed && drift(p.ring.getBoundingClientRect(), target.getBoundingClientRect()) > 1) {
        // Engine disagrees with the target's real box (transforms in Firefox): this step goes fixed.
        this.#fixed = true;
        this.#mode(p, card);
      }
      this.#update();
      this.#track(true);
      positioning = this.#fixed ? "fixed" : "anchor";
    }
    this.#watchModals(true);
    this.#emit("show", { target, title, message, placement: this.#placement });
    return { shown: true, positioning };
  }

  /** Dismiss the current step. Returns false when nothing was showing. */
  hide(): boolean {
    return this.#end("hide");
  }

  destroy(): void {
    this.#end("hide");
    this.#parts?.host.remove();
    this.#parts = this.#defaults = this.#card = undefined;
    for (const s of Object.values(this.#listeners)) s.clear();
  }

  // ---- internals ----------------------------------------------------------

  #build(): Parts {
    const host = document.createElement("div");
    host.setAttribute("data-webmcp-tour-root", "");
    const root = host.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [createSheet()];
    const ring = part("div", "spotlight");
    ring.setAttribute("popover", "manual");
    const card = part("div", "popover");
    card.setAttribute("popover", "manual");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "Assistant guidance");
    const attribution = part("span", "attribution");
    const close = part("button", "close");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    const title = part("span", "title");
    const message = part("span", "message");
    const goto = part("button", "goto");
    goto.type = "button";
    goto.textContent = "Take me there";
    card.append(attribution, close, title, message, goto);
    card.addEventListener("click", this.#click);
    this.#defaults = { attribution, title, message, card };
    return { host, root, ring, card };
  }

  #fill(target: Element, title: string, message: string): void {
    const d = this.#defaults!;
    d.attribution.textContent = this.#opts.attribution ?? "From your assistant";
    d.title.textContent = title;
    d.message.textContent = message;
    let card = d.card;
    const hook = this.#opts.renderPopover;
    if (hook) {
      const step: RenderStep = { target, title, message, placement: this.#placement };
      try {
        const custom = hook(step, d.card);
        if (custom instanceof HTMLElement) card = custom;
      } catch {
        // A broken hook falls back to the default card.
      }
    }
    if (card !== d.card) {
      card.setAttribute("popover", "manual");
      card.setAttribute("part", `popover ${card.getAttribute("part") ?? ""}`.trim());
      card.addEventListener("click", this.#click);
    }
    this.#card = card;
  }

  // An arrow property: one stable listener, so re-adding it per show is a no-op.
  #click = (e: Event): void => {
    for (const n of e.composedPath()) {
      if (!(n instanceof Element)) continue;
      const parts = n.getAttribute("part") ?? "";
      if (/(^|\s)close(\s|$)/.test(parts)) return void this.#end("hide");
      if (/(^|\s)goto(\s|$)/.test(parts)) return (this.#target as HTMLElement | undefined)?.focus?.();
    }
  };

  #mode(p: Parts, card: HTMLElement): void {
    for (const e of [p.ring, card]) {
      e.toggleAttribute("data-fixed", this.#fixed);
      e.removeAttribute("data-clipped");
      if (card === e) e.dataset["placement"] = this.#placement;
    }
    if (!this.#fixed) clearFixed(p.ring, card);
  }

  /** Per-frame work: fixed placement, or just the clip check in anchor mode. */
  #update = (): void => {
    this.#raf = 0;
    const t = this.#target;
    const p = this.#parts;
    const card = this.#card;
    if (!t || !p || !card) return;
    if (this.#fixed) placeFixed(t, p.ring, card, this.#placement);
    const clipped = isClipped(t);
    for (const e of [p.ring, card]) e.toggleAttribute("data-clipped", clipped);
  };

  #schedule = (): void => {
    this.#raf ||= requestAnimationFrame(this.#update);
  };

  #track(on: boolean): void {
    const m = on ? "addEventListener" : "removeEventListener";
    // Scroll does not bubble: capture catches every scroll container.
    document[m]("scroll", this.#schedule, { capture: true, passive: true });
    window[m]("resize", this.#schedule, { passive: true });
    this.#ro?.disconnect();
    if (on && this.#target) {
      this.#ro ??= new ResizeObserver(this.#schedule);
      this.#ro.observe(this.#target);
      if (this.#fixed && this.#card) this.#ro.observe(this.#card);
    }
  }

  /** A modal opened after the step covers the overlay and makes the target inert: dismiss, never re-raise. */
  #watchModals(on: boolean): void {
    this.#mo?.disconnect();
    if (!on) return;
    this.#mo ??= new MutationObserver(() => {
      const t = this.#target;
      if (!t) return;
      const closed = this.#modal && !this.#modal.matches(":modal");
      if (closed || (!this.#modal && document.querySelector("dialog:modal"))) this.#end("obscured");
    });
    this.#mo.observe(document, { attributes: true, attributeFilter: ["open"], subtree: true });
  }

  #end(reason: DismissReason): boolean {
    const target = this.#target;
    if (!target) return false;
    this.#target = undefined;
    this.#modal = null;
    this.#track(false);
    this.#watchModals(false);
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    const p = this.#parts;
    if (p) {
      for (const e of [p.ring, this.#card!]) if (e.matches(":popover-open")) e.hidePopover();
      if (this.#card !== this.#defaults?.card) this.#card?.remove();
    }
    this.#emit("dismiss", { target, reason });
    return true;
  }
}
