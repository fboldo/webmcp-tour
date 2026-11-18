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

export type DismissReason = "hide" | "superseded" | "obscured";

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
   * attribute and dismissal (any `[part~=close]` / `[part~=goto]` inside the
   * returned element is wired); the hook owns everything else, including
   * escaping. `defaultEl` is the built-in card, already filled in.
   */
  renderPopover?: (step: RenderStep, defaultEl: HTMLElement) => HTMLElement;
  /** "auto" (default) uses CSS anchor positioning where supported, with a per-step fixed fallback. */
  positioning?: "auto" | "anchor" | "fixed";
  /** Provenance label. Present by default; overridable. */
  attribution?: string;
  /** Also set `aria-describedby` on the target (a light-DOM copy of the message), restored on dismiss. Default off. */
  describeTarget?: boolean;
}

export interface OverlayEvents {
  show: { target: Element } & Required<Omit<OverlayStep, "announcement">>;
  dismiss: { target: Element; reason: DismissReason };
}
