import type { Labels, OverlayEvents, Placement, RenderStep } from "../engine/overlay/index.js";
import type { Matched, ResolveError, Reveal, TargetInfo } from "../engine/resolver/index.js";
import type { ToolDefinition, ToolNames } from "../tools/definitions.js";

/** A page of the app, for suggesting navigation. */
export interface PageDefinition {
  id: string;
  /** Where Go sends the user (relative or absolute), via the `navigate` option. */
  url: string;
  /** Shown in the suggestion card and in target lists. */
  title: string;
  /** Short; shown to the agent in `tour_list_targets`. */
  description?: string;
  /**
   * Decides whether this is the current page. A string is a `location.pathname` prefix, a RegExp is tested against the pathname,
   * a function gets `location`. Default: the `url` path equals `location.pathname`. The first matching page wins.
   */
  match?: string | RegExp | ((location: Location) => boolean);
}

export interface PageInfo {
  id: string;
  title: string;
}

/** What `tour.show` takes: exactly one of `target`, `selector`, `text`, `page`. */
export interface StepInput {
  /** Declared target id (`data-tour-id` or `defineTarget`). */
  target?: string;
  /** CSS selector; matches visible elements only. */
  selector?: string;
  /** Visible text, label or aria-label of the element. */
  text?: string;
  /** Page id: suggest going there (a card with Go / Not now). Never navigates by itself. */
  page?: string;
  /** 0-based pick among tied candidates, in document order. */
  index?: number;
  /** Plain text, at most 80 characters. */
  title?: string;
  /** Plain text, at most 500 characters. Required unless the target is declared with a description. */
  message?: string;
  placement?: Placement;
}

export type StepResult =
  | { ok: true; matched: Matched & Reveal }
  /** The page locator: a suggestion card is showing. */
  | { ok: true; suggested: PageInfo }
  | ResolveError
  /** The target is declared for another page: a suggestion card is showing instead of a highlight. */
  | { ok: false; error: "other_page"; page: PageInfo; message: string }
  | { ok: false; error: "page_not_found"; available: string[] }
  /** A modal dialog the target is not inside is open, so the page behind it is inert. */
  | { ok: false; error: "obscured"; message: string }
  /** No document to draw in (server-side render). */
  | { ok: false; error: "unavailable"; message: string };

export type WaitEvent = "click" | "change";

/** What `tour.waitForInteraction` takes: at most one of `target`, `selector`, `text`; none means the highlighted element. */
export interface WaitInput {
  target?: string;
  selector?: string;
  text?: string;
  index?: number;
  /** Default by element: `click` for buttons and links, `change` for fields. Never `input`. */
  events?: WaitEvent[];
}

export interface WaitOptions {
  /** Teardown signal. The tools pass the host's execution-time signal. */
  signal?: AbortSignal;
  /** Internal deadline, default 20 s. */
  timeoutMs?: number;
}

/**
 * Never carries a field value. A timeout or a supersede is a success: the user has not
 * acted (yet) and the highlight stays. A CDP-driven agent click is trusted, so
 * `interacted` means an interaction happened, not that a person did it.
 */
export type WaitResult =
  | { ok: true; status: "interacted"; event: WaitEvent; target: { tag: string; name: string } }
  /** "Got it": the user read the step and wants to continue. */
  | { ok: true; status: "acknowledged" }
  /** A page suggestion: the user pressed Go (`navigating`) or Not now / close (`dismissed`). */
  | { ok: true; status: "navigating" | "dismissed" }
  | { ok: true; status: "timeout" | "superseded" }
  | ResolveError
  /** No locator given and nothing is highlighted. */
  | { ok: false; error: "no_step"; message: string }
  /** The signal aborted, so nobody is listening for this. */
  | { ok: false; error: "cancelled"; message: string }
  | { ok: false; error: "unavailable"; message: string };

export interface DismissResult {
  ok: true;
  dismissed: true;
}

export interface TargetDefinition {
  id: string;
  /** Resolved at lookup time; the first match is used. Give this or `element`; or neither, with `page`. */
  selector?: string;
  element?: Element;
  /** Page id the target lives on. Not the current page: the target is listed as off-page and `show` suggests going there. */
  page?: string;
  /** Accessible-name override for target lists. */
  label?: string;
  /** Default popover message when `show` gets none. */
  description?: string;
  /** Hint returned as `not_visible.reveal` when the element is hidden. */
  reveal?: string;
}

export interface TourOptions {
  /** Only elements inside this element can be pointed at. */
  scope?: Element;
  /** CSS selector of elements (and subtrees) that can never be pointed at. Also: `data-tour-exclude`. */
  exclude?: string;
  /** Turn a locator off. Both are on by default; `target` is always on. */
  locators?: { selector?: boolean; text?: boolean };
  /** Replace the card's markup; the library keeps positioning and dismissal. */
  renderPopover?: (step: RenderStep, defaultEl: HTMLElement) => HTMLElement;
  /** `false` = headless: no DOM is created, only `show` / `dismiss` events fire. */
  render?: boolean;
  /** Provenance label on the card. Default "From your assistant". Deprecated: use `labels.attribution`. */
  attribution?: string;
  /** Every user-facing string (and the card's aria labels). `goToPage` and `otherPage` take `{page}`. English defaults. */
  labels?: Partial<Labels>;
  /** Also show "Take me there" (scroll, focus, pulse) next to "Got it". Default off. */
  takeMeThere?: boolean;
  /** The app's pages, so the agent can suggest going to another one. */
  pages?: PageDefinition[];
  /** Called only when the user presses Go on a suggestion. Default `location.assign`; give your router's push for an SPA. */
  navigate?: (url: string) => void;
  /** Also point the target's `aria-describedby` at a hidden copy of the message while the step shows. Default off. */
  describeTarget?: boolean;
}

/** `targets` fires when `defineTarget` or `definePage` adds or removes something. `data-tour-id` elements are read at call time and fire nothing. */
export type TourEvents = OverlayEvents & { targets: Record<string, never> };

export interface Tour {
  /** Resolve the step's element, point at it, and return the tool-shaped envelope. Replaces the current step. */
  show(step: StepInput): Promise<StepResult>;
  /**
   * Resolve when the user interacts with the highlighted element (or the one named).
   * A new wait, or a new `show`, settles the pending one with `superseded`.
   */
  waitForInteraction(input?: WaitInput, options?: WaitOptions): Promise<WaitResult>;
  /** Remove the current highlight. Idempotent. */
  dismiss(): DismissResult;
  on<K extends keyof TourEvents>(type: K, fn: (e: TourEvents[K]) => void): () => void;
  /** Declare a target in code. Returns a function that removes it. Throws on bad input. */
  defineTarget(def: TargetDefinition): () => void;
  /** Declare a page. Returns a function that removes it. Throws on bad input. */
  definePage(def: PageDefinition): () => void;
  /** The current page, if one matches. */
  page(): PageInfo | undefined;
  /**
   * Declared targets, as `tour_list_targets` reports them (capped; `total` counts all): those here, then those on other pages.
   * `page` is the current page; `pages` the others.
   */
  targets(): { targets: TargetInfo[]; total: number; page?: PageInfo; pages?: (PageInfo & { description?: string })[] };
  /**
   * Tool definitions to register under your own names and timing:
   * `show_step`, `list_targets`, `dismiss`, `wait_for_interaction`, in that order. Registers nothing itself.
   * Throws on bad names. Each `execute` returns an envelope and never throws.
   */
  tools(options?: { names?: Partial<ToolNames> }): ToolDefinition[];
  /** Dismiss, remove the overlay and release the singleton. */
  destroy(): void;
}
