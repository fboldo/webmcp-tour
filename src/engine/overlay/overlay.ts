// Overlay: spotlight + card, drawn in the top layer inside an open shadow
// root. Takes an Element; no resolver logic. See the plan's Theme section.

import { createSheet } from "../theme/index.js";
import { clearFixed, drift, isClipped, placeFixed } from "./position.js";
import { LABELS } from "./types.js";
import type {
  DismissReason,
  Labels,
  OverlayEvents,
  OverlayNotice,
  OverlayOptions,
  OverlayStep,
  Placement,
  RenderStep,
  ShowResult,
} from "./types.js";

type Parts = { host: HTMLElement; root: ShadowRoot; ring: HTMLElement; card: HTMLElement; live: HTMLElement };
const ANNOUNCE_DELAY = 50;
const FIELD = "input,textarea,select,[contenteditable]:not([contenteditable=false])";
let describedSeq = 0;

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
  #defaults: { attribution: HTMLElement; close: HTMLElement; title: HTMLElement; message: HTMLElement; actions: HTMLElement[]; card: HTMLElement } | undefined;
  #notice = false; // the card is a page suggestion: no target, no spotlight
  #target: Element | undefined;
  #card: HTMLElement | undefined; // the card in use: default or the hook's
  #placement: Placement = "auto";
  #fixed = false;
  #modal: Element | null = null; // the dialog we are mounted in
  #raf = 0;
  #ro: ResizeObserver | undefined;
  #mo: MutationObserver | undefined;
  #anchorOk: boolean | undefined;
  #announce = 0; // pending live-region timer
  #desc: { node: HTMLElement; id: string; original: string | null } | undefined;

  constructor(options: OverlayOptions = {}) {
    this.#opts = options;
  }

  #label(k: keyof Labels, page?: string): string {
    const o = this.#opts;
    const t = o.labels?.[k] ?? LABELS[k];
    return page === undefined ? t : t.replaceAll("{page}", page);
  }

  /** The element currently pointed at, if any. */
  get target(): Element | undefined {
    return this.#target;
  }

  /**
   * Put the (empty) host and its persistent live region in the page now, so
   * assistive tech has registered the region before the first announcement.
   * No-op when headless. `show` mounts it too, so calling this is optional.
   */
  mount(): void {
    if (this.#opts.render === false || typeof document === "undefined") return;
    const place = (): void => {
      const p = (this.#parts ??= this.#build());
      const m = document.body ?? document.documentElement;
      if (p.host.parentNode !== m && !this.#modal) m.append(p.host);
    };
    if (document.body || document.readyState !== "loading") place();
    else document.addEventListener("DOMContentLoaded", place, { once: true });
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

  /** A modal dialog is open and `el` is not inside it, so `el` is inert and `show` would refuse. */
  blocks(el: Element): boolean {
    return !modalAncestor(el) && !!document.querySelector("dialog:modal");
  }

  show(target: Element, step: OverlayStep = {}): ShowResult {
    return this.#present(target, step);
  }

  /** A card with no target and no spotlight, offering to go to another page. Plain text only. */
  notice(n: OverlayNotice): ShowResult {
    return this.#present(n.anchor ?? null, { title: n.title ?? "", message: this.#label("otherPage", n.page) }, n.page);
  }

  #present(el: Element | null, step: OverlayStep, page?: string): ShowResult {
    if (this.#target) this.#end("superseded");
    const target = el ?? document.body ?? document.documentElement; // a notice has nothing to point at; the page stands in for it
    const modal = el ? modalAncestor(target) : null;
    // Everything outside an open modal is inert: pointing there is pointless.
    if (!modal && document.querySelector("dialog:modal"))
      return { shown: false, positioning: "none", reason: "obscured" };

    const title = step.title ?? "";
    const message = step.message ?? "";
    this.#placement = step.placement ?? "auto";
    this.#target = target;
    this.#notice = page !== undefined;
    this.#modal = modal;
    let positioning: ShowResult["positioning"] = "none";

    if (this.#opts.render !== false) {
      const p = (this.#parts ??= this.#build());
      this.#fill(el, title, message, page);
      if (el && !this.#notice) this.#describe(target, message);
      // The overlay lives inside the modal so it is not inert.
      const mount = modal ?? document.body ?? document.documentElement;
      if (p.host.parentNode !== mount) mount.append(p.host);
      // Chromium remembers the last position-try fallback; re-inserting resets it.
      const card = this.#card!;
      p.root.append(...(el ? [p.ring, card] : [card]));
      this.#anchorOk ??= (this.#opts.positioning ?? "auto") === "auto" ? supportsAnchor() : this.#opts.positioning === "anchor";
      this.#fixed = !!el && !this.#anchorOk;
      this.#mode(p, card);
      if (!el) {
        card.showPopover();
        positioning = "none";
      } else for (const e of [p.ring, card])
        e.showPopover(this.#fixed ? undefined : { source: target as HTMLElement });
      if (el && !this.#fixed && drift(p.ring.getBoundingClientRect(), target.getBoundingClientRect()) > 1) {
        // Engine disagrees with the target's real box (transforms in Firefox): this step goes fixed.
        this.#fixed = true;
        this.#mode(p, card);
      }
      if (el) {
        this.#update();
        this.#track(true);
        positioning = this.#fixed ? "fixed" : "anchor";
      }
    }
    this.#watchModals(true);
    window.addEventListener("keydown", this.#key);
    this.#say(step.announcement ?? message);
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
    clearTimeout(this.#announce);
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
    const attribution = part("span", "attribution");
    const btn = (name: string) => {
      const b = part("button", name);
      b.type = "button";
      return b;
    };
    const close = btn("close");
    close.textContent = "×";
    const title = part("span", "title");
    const message = part("span", "message");
    // One element per part: which of them the card shows is decided per step in #fill.
    const actions = ["gotit", "goto", "go", "notnow"].map(btn);
    const row = part("div", "actions");
    row.append(...actions);
    card.append(attribution, close, title, message, row);
    const live = part("div", "live");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    root.append(live);
    card.addEventListener("click", this.#click);
    this.#defaults = { attribution, close, title, message, actions, card };
    return { host, root, ring, card, live };
  }

  /** Fill the default card; `page` makes it the page suggestion, otherwise the step card. */
  #fill(target: Element | null, title: string, message: string, page?: string): void {
    const d = this.#defaults!;
    const attribution = this.#label("attribution");
    d.attribution.textContent = attribution;
    d.card.setAttribute("aria-label", attribution);
    d.close.setAttribute("aria-label", this.#label("close"));
    d.title.textContent = title;
    d.message.textContent = message;
    const texts = [this.#label("gotIt"), this.#label("takeMeThere"), this.#label("goToPage", page ?? ""), this.#label("notNow")];
    const shown = page !== undefined ? [2, 3] : this.#opts.takeMeThere ? [0, 1] : [0];
    d.actions.forEach((b, i) => {
      b.textContent = texts[i]!;
      b.hidden = !shown.includes(i);
    });
    // Notices: centred or cornered unless anchored to `target`. Focusable (not focused) so keyboard users can reach the card.
    const where = page === undefined || target ? undefined : (this.#opts.noticePlacement ?? "center");
    if (where) d.card.dataset["notice"] = where;
    else delete d.card.dataset["notice"];
    if (page === undefined) d.card.removeAttribute("tabindex");
    else d.card.tabIndex = -1;
    let card = d.card;
    const hook = this.#opts.renderPopover;
    if (hook && target && page === undefined) {
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
      const is = (p: string) => n.part.contains(p);
      if (is("close") || is("notnow")) return void this.#end(this.#notice ? "declined" : "closed");
      if (is("gotit")) return void this.#end("acknowledged");
      if (is("go")) return void this.#end("navigating");
      if (is("goto")) return this.#goto();
    }
  };

  /** User-triggered: scroll the target into view, focus it with a visible ring, pulse the spotlight. A target that cannot take focus gets tabindex=-1 until it blurs. */
  #goto(): void {
    const t = this.#target as HTMLElement | undefined;
    if (!t?.focus || this.#notice) return;
    const r = t.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) t.scrollIntoView({ block: "center", inline: "nearest" });
    const focus = (): void => t.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    focus();
    if (!t.matches(":focus") && !t.hasAttribute("tabindex")) {
      t.setAttribute("tabindex", "-1");
      t.addEventListener("blur", () => t.removeAttribute("tabindex"), { once: true });
      focus();
    }
    if (!matchMedia("(prefers-reduced-motion:reduce)").matches)
      this.#parts?.ring.animate?.([{ outlineOffset: "2px" }, { outlineOffset: "9px" }, { outlineOffset: "2px" }], { duration: 600 });
  }

  /** Escape dismisses from inside the card, or when nothing else claimed the key. */
  #key = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || e.isComposing || !this.#target) return;
    const path = e.composedPath();
    // Outside the card, a key the page's own handler used, or one typed in a field (Escape cancels the field), is not ours.
    if (!path.includes(this.#card!) && (e.defaultPrevented || (path[0] instanceof Element && path[0].matches(FIELD)))) return;
    this.#end(this.#notice ? "declined" : "closed");
  };

  /** Announce through the persistent region: clear, then set after a beat so repeats are heard. */
  #say(text: string): void {
    const live = this.#parts?.live;
    clearTimeout(this.#announce);
    if (!live) return;
    live.textContent = "";
    if (text) this.#announce = window.setTimeout(() => (live.textContent = text), ANNOUNCE_DELAY);
  }

  /** Optional: aria-describedby on the target, pointing at a light-DOM copy of the message (IDREFs do not cross shadow roots). */
  #describe(target: Element, message: string): void {
    if (!this.#opts.describeTarget || !message) return;
    const node = document.createElement("span");
    const id = `webmcp-tour-desc-${++describedSeq}`;
    node.id = id;
    node.textContent = message;
    node.setAttribute("data-webmcp-tour-root", ""); // never resolvable
    Object.assign(node.style, { position: "fixed", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "pre" });
    const tree = target.getRootNode();
    (tree instanceof ShadowRoot ? tree : (target.ownerDocument.body ?? target.ownerDocument.documentElement)).append(node);
    const original = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", original ? `${original} ${id}` : id);
    this.#desc = { node, id, original };
  }

  #undescribe(target: Element): void {
    const d = this.#desc;
    if (!d) return;
    this.#desc = undefined;
    d.node.remove();
    // Take back only our token: the page may have edited the attribute since.
    const rest = (target.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((t) => t && t !== d.id).join(" ");
    if (rest) target.setAttribute("aria-describedby", rest);
    else target.removeAttribute("aria-describedby");
  }

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
    window.removeEventListener("keydown", this.#key);
    this.#undescribe(target);
    this.#say("");
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
