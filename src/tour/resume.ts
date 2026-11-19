// Resume after navigation. Only a random nonce travels in the URL; the step itself
// (target, title, message) stays in this tab's sessionStorage, so a crafted link can
// never make the page show text "from your assistant".

/** The step to show on the destination page. */
export interface Pending {
  page: string;
  target?: string | undefined;
  title?: string | undefined;
  message?: string | undefined;
}

const PREFIX = "webmcp-tour:";
const TTL_MS = 120_000;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Store `step`; returns `url` (same-origin only) with the nonce added as `param`, or undefined when it cannot resume. */
export function stash(step: Pending, url: string, param: string): { url: string; nonce: string } | undefined {
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(PREFIX + nonce, JSON.stringify({ page: step.page, target: step.target, title: step.title, message: step.message, t: Date.now() }));
    u.searchParams.set(param, nonce);
    return { url: u.pathname + u.search + u.hash, nonce };
  } catch {}
}

/** The fresh entry for `nonce`, if any. An unknown or expired nonce is nothing. */
export function peek(nonce: string): Pending | undefined {
  try {
    const e = JSON.parse(sessionStorage.getItem(PREFIX + nonce) ?? "null");
    const page = str(e?.page);
    if (page && typeof e.t === "number" && Date.now() - e.t <= TTL_MS && e.t <= Date.now() + 1000)
      return { page, target: str(e.target), title: str(e.title), message: str(e.message) };
  } catch {}
}

export const drop = (nonce: string): void => {
  try {
    sessionStorage.removeItem(PREFIX + nonce);
  } catch {}
};

/** Take the nonce out of the address bar (keeps history state and the rest of the URL). */
export function strip(param: string, nonce: string): void {
  const u = new URL(location.href);
  if (u.searchParams.get(param) !== nonce) return;
  u.searchParams.delete(param);
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
}
