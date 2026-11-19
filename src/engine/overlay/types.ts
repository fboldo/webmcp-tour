export type Placement = "auto" | "above" | "below";

/** What a step needs to be drawn. Plain text only: rendered as `textContent`. */
export interface OverlayStep {
  title?: string;
  message?: string;
  /** Preferred side of the target for the card. Default "auto" (below, flipping when it does not fit). */
  placement?: Placement;
  /** What the live region says. Default: the message. */
  announcement?: string;
}

/** What `renderPopover` receives. */
export interface RenderStep {
  target: Element;
  title: string;
  message: string;
  placement: Placement;
}

/**
 * `hide`: the host called `hide()`. `closed`: the user closed a step card (close, Escape). `acknowledged`: Got it.
 * `navigating`: Go on a page suggestion. `declined`: the suggestion was closed (Not now, close, Escape).
 */
export type DismissReason = "hide" | "closed" | "superseded" | "obscured" | "acknowledged" | "navigating" | "declined";

/** Every user-facing string. `goToPage` and `otherPage` are templates: `{page}` is the page title. */
export interface Labels {
  gotIt: string;
  takeMeThere: string;
  close: string;
  attribution: string;
  goToPage: string;
  notNow: string;
  otherPage: string;
}

export const LABELS: Readonly<Labels> = {
  gotIt: "Got it",
  takeMeThere: "Take me there",
  close: "Dismiss",
  attribution: "From your assistant",
  goToPage: "Go to {page}",
  notNow: "Not now",
  otherPage: "Your assistant suggests going to {page}",
};

export interface ShowResult {
  shown: boolean;
  /** How the step is positioned. "none" when headless or not shown. */
  positioning: "anchor" | "fixed" | "none";
  /** Set when `shown` is false: a modal dialog the target is not inside is open, so the target is inert. */
  reason?: "obscured";
}

export interface OverlayOptions {
  /** `false` = headless: no DOM is created, only events fire. */
  render?: boolean;
  /**
   * Replace the card's markup. The library owns positioning, the `popover`
   * attribute and dismissal (any `[part~=close]` / `[part~=gotit]` / `[part~=goto]` inside the
   * returned element is wired); the hook owns everything else, including
   * escaping. `defaultEl` is the built-in card, already filled in.
   */
  renderPopover?: (step: RenderStep, defaultEl: HTMLElement) => HTMLElement;
  /** "auto" (default) uses CSS anchor positioning where supported, with a per-step fixed fallback. */
  positioning?: "auto" | "anchor" | "fixed";
  /** Translations; English defaults. */
  labels?: Partial<Labels>;
  /** Add a "Take me there" button (scroll, focus, pulse) next to "Got it". Default off. */
  takeMeThere?: boolean;
  /** Where a page suggestion without an `anchor` goes: centred over a light backdrop (default) or in the bottom-right corner. */
  noticePlacement?: "center" | "corner";
  /** Also set `aria-describedby` on the target (a light-DOM copy of the message), restored on dismiss. Default off. */
  describeTarget?: boolean;
}

export interface OverlayEvents {
  show: { target: Element } & Required<Omit<OverlayStep, "announcement">>;
  dismiss: { target: Element; reason: DismissReason };
}

/** A card with no target: suggests another page. Plain text only. */
export interface OverlayNotice {
  title?: string;
  /** Page title, filled into the `{page}` templates. */
  page: string;
  /** Ring this element and put the card next to it, instead of centring or cornering it. */
  anchor?: Element | undefined;
}
