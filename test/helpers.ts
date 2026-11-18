import { commands } from "vitest/browser";
import type { Overlay } from "../src/engine/overlay/index.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia(options: {
      forcedColors?: "active" | "none" | null;
      reducedMotion?: "reduce" | "no-preference" | null;
    }): Promise<void>;
  }
}

export interface Fixture {
  win: Window & typeof globalThis & { overlay: Overlay; violations: { directive: string; sample: string }[] };
  doc: Document;
  overlay: Overlay;
  el(id: string): HTMLElement;
  frames(n?: number): Promise<void>;
  /** Scroll the target into view, show a step, wait two frames. */
  show(id: string, opts?: { block?: ScrollLogicalPosition | null; message?: string; placement?: "auto" | "above" | "below" }): Promise<ReturnType<Overlay["show"]>>;
  close(): void;
}

const open: Fixture[] = [];

/** Open the fixture page (served with a real CSP header) in a same-origin iframe of the given CSS size. */
export async function openFixture(opts: { query?: string; width?: number; height?: number } = {}): Promise<Fixture> {
  const f = document.createElement("iframe");
  Object.assign(f.style, {
    position: "fixed",
    top: "0",
    left: "0",
    border: "0",
    width: `${opts.width ?? 1000}px`,
    height: `${opts.height ?? 800}px`,
    zIndex: "9",
    background: "#fff",
  });
  f.src = `/fx/page.html${opts.query ? `?${opts.query}` : ""}`;
  document.body.append(f);
  await new Promise<void>((r) => f.addEventListener("load", () => r(), { once: true }));
  const win = f.contentWindow as Fixture["win"];
  const doc = f.contentDocument!;
  for (let i = 0; i < 200 && !doc.documentElement.dataset["ready"]; i++) await new Promise((r) => setTimeout(r, 10));
  if (!doc.documentElement.dataset["ready"]) throw new Error("fixture did not become ready");
  const fx: Fixture = {
    win,
    doc,
    overlay: win.overlay,
    el: (id) => doc.getElementById(id)!,
    frames: async (n = 2) => {
      for (let i = 0; i < n; i++) await new Promise((r) => win.requestAnimationFrame(r));
    },
    async show(id, o = {}) {
      const t = fx.el(id);
      if (o.block !== null) t.scrollIntoView({ block: o.block ?? "center" });
      await fx.frames();
      const res = fx.overlay.show(t, {
        title: "Change your plan",
        message: o.message ?? "Click here to pick a different plan.",
        ...(o.placement ? { placement: o.placement } : {}),
      });
      await fx.frames();
      return res;
    },
    close() {
      fx.overlay.destroy();
      f.remove();
      open.splice(open.indexOf(fx), 1);
    },
  };
  open.push(fx);
  return fx;
}

export async function cleanup(): Promise<void> {
  for (const fx of [...open]) fx.close();
  await commands.emulateMedia({ forcedColors: null, reducedMotion: null });
}

export const emulateMedia = (o: Parameters<typeof commands.emulateMedia>[0]) => commands.emulateMedia(o);

type R = { x: number; y: number; w: number; h: number; r: number; b: number };
const rect = (e: Element): R => {
  const r = e.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
};

export function parts(fx: Fixture) {
  const root = fx.overlay.host!.shadowRoot!;
  const q = <T extends HTMLElement>(p: string) => root.querySelector<T>(`[part~=${p}]`)!;
  return { root, ring: q("spotlight"), card: q("popover"), close: q("close"), goto: q("goto"), title: q("title"), message: q("message"), attribution: q("attribution") };
}

/** Geometry snapshot plus who wins the hit test at the card's centre. */
export function geom(fx: Fixture, id: string) {
  const { ring, card } = parts(fx);
  const c = card.getBoundingClientRect();
  const hit = fx.doc.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  return {
    target: rect(fx.el(id)),
    ring: rect(ring),
    card: rect(card),
    vw: fx.doc.documentElement.clientWidth,
    vh: fx.doc.documentElement.clientHeight,
    cardOnTop: hit === fx.overlay.host,
    cardOpen: card.matches(":popover-open"),
  };
}
export type Geom = ReturnType<typeof geom>;

export function ringOnTarget(g: Geom, tol = 1): boolean {
  return (["x", "y", "w", "h"] as const).every((k) => Math.abs(g.ring[k] - g.target[k]) <= tol);
}

export function overlaps(a: R, b: R): boolean {
  return a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y;
}

/** Inside the viewport, not over the target, gap to the target ≤ 12 px. */
export function cardPlaced(g: Geom): { ok: boolean; why: string } {
  const { card: c, target: t } = g;
  if (c.x < 0 || c.y < 0 || c.r > g.vw || c.b > g.vh) return { ok: false, why: `card outside viewport ${JSON.stringify(c)}` };
  if (overlaps(c, t)) return { ok: false, why: "card overlaps target" };
  const gap = c.y >= t.b ? c.y - t.b : t.y - c.b;
  if (gap < 0 || gap > 12) return { ok: false, why: `gap ${gap}` };
  return { ok: true, why: "" };
}
