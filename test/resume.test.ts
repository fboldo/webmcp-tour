// Resume the intended step after navigation: a nonce in the URL, the step in sessionStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../src/index.js";
import type { Tour, TourOptions } from "../src/index.js";

const slots = globalThis as Record<symbol, unknown>;
const MESSAGE = "Starts two-factor setup for your account.";
const PAGE = `
  <button id="tfa" data-tour-id="two-factor" data-tour-page="security" data-tour-label="Set up two-factor" data-tour-description="${MESSAGE}">Set up two-factor</button>
`;
const PAGES = [
  { id: "billing", url: "/billing", title: "Billing" },
  { id: "security", url: "/security", title: "Security" },
];
const stored = () => Object.keys(sessionStorage).filter((k) => k.startsWith("webmcp-tour:"));

let tour: Tour;
const urls: string[] = [];
const options = (o: TourOptions = {}): TourOptions => ({ pages: PAGES, navigate: (u) => void urls.push(u), ...o });
const fresh = (o: TourOptions = {}) => {
  tour.destroy();
  tour = createTour(options(o));
};
const root = () => document.querySelector("[data-webmcp-tour-root]")!.shadowRoot!;
const q = (p: string) => root().querySelector<HTMLElement>(`[part~=${p}]`)!;
const shown = () => !!document.querySelector("[data-webmcp-tour-root]")?.shadowRoot?.querySelector("[part~=popover]")?.matches(":popover-open");
const quiet = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const nonceOf = (url: string) => new URL(url, location.href).searchParams.get("webmcp-tour")!;
/** Press Go on a suggestion for the two-factor target and return the URL handed to navigate. */
const go = async (): Promise<string> => {
  await tour.show({ target: "two-factor", title: "Two-factor", message: "Turn it on here." });
  q("go").click();
  return urls.at(-1)!;
};
/** A full page load of `url`: the old tour is gone, sessionStorage survives. */
const load = (url: string, o: TourOptions = {}) => {
  tour.destroy();
  history.replaceState(null, "", url);
  tour = createTour(options(o));
};

beforeEach(() => {
  urls.length = 0;
  sessionStorage.clear();
  history.replaceState(null, "", "/billing");
  document.body.innerHTML = PAGE;
  tour = createTour(options());
});
afterEach(() => {
  tour?.destroy();
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("what goes in the URL", () => {
  it("only a nonce: no message, title, target or page", async () => {
    const url = await go();
    expect(url).toMatch(/^\/security\?webmcp-tour=[0-9a-f]{24}$/);
    for (const secret of ["Turn it on", "Two-factor", "two-factor", "message", "title"]) expect(url).not.toContain(secret);
    expect(stored()).toHaveLength(1);
  });

  it("keeps the rest of the destination URL", async () => {
    fresh({ pages: [{ id: "billing", url: "/billing", title: "Billing" }, { id: "security", url: "/security?tab=2#mfa", title: "Security" }] });
    expect((await go()).replace(/webmcp-tour=[0-9a-f]+/, "N")).toBe("/security?tab=2&N#mfa");
  });

  it("the param name is configurable", async () => {
    fresh({ resume: { param: "tour" } });
    expect(await go()).toMatch(/^\/security\?tour=[0-9a-f]{24}$/);
  });

  it("resume: false leaves the URL alone and stores nothing", async () => {
    fresh({ resume: false });
    expect(await go()).toBe("/security");
    expect(stored()).toEqual([]);
  });

  it("a different origin gets the plain URL and nothing is stored", async () => {
    fresh({ pages: [{ id: "billing", url: "/billing", title: "Billing" }, { id: "security", url: "https://example.com/security", title: "Security" }] });
    expect(await go()).toBe("https://example.com/security");
    expect(stored()).toEqual([]);
  });
});

describe("after a full page load", () => {
  it("shows the step, removes the param and uses the entry up", async () => {
    const url = await go();
    load(url);
    await vi.waitFor(() => expect(shown()).toBe(true));
    expect(q("message").textContent).toBe("Turn it on here.");
    expect(q("title").textContent).toBe("Two-factor");
    expect(location.search).toBe("");
    expect(location.pathname).toBe("/security");
    expect(stored()).toEqual([]);
  });

  it("is single use: the same link again shows nothing", async () => {
    const url = await go();
    load(url);
    await vi.waitFor(() => expect(shown()).toBe(true));
    load(url);
    await quiet();
    expect(shown()).toBe(false);
    expect(location.search).toBe("");
  });

  it("falls back to the target's description when no message was given", async () => {
    await tour.show({ target: "two-factor" });
    q("go").click();
    load(urls.at(-1)!);
    await vi.waitFor(() => expect(shown()).toBe(true));
    expect(q("message").textContent).toBe(MESSAGE);
  });

  it("the next tool result says it resumed, once", async () => {
    const url = await go();
    load(url);
    await vi.waitFor(() => expect(shown()).toBe(true));
    const [, list, dismiss] = tour.tools();
    expect(await list!.execute({})).toMatchObject({ ok: true, resumed: { page: "security", target: "two-factor" } });
    expect(await dismiss!.execute({})).not.toHaveProperty("resumed");
  });

  it("a page suggestion (no target) resumes as just the page", async () => {
    await tour.show({ page: "security" });
    q("go").click();
    load(urls.at(-1)!);
    await vi.waitFor(() => expect(tour.takeResumed()).toEqual({ page: "security" }));
    expect(shown()).toBe(false);
  });

  it("waits for a target that renders late", async () => {
    const url = await go();
    document.body.innerHTML = "";
    load(url);
    await quiet(50);
    expect(shown()).toBe(false);
    document.body.innerHTML = PAGE;
    await vi.waitFor(() => expect(shown()).toBe(true));
  });

  it("honours a custom param", async () => {
    fresh({ resume: { param: "tour" } });
    const url = await go();
    load(url, { resume: { param: "tour" } });
    await vi.waitFor(() => expect(shown()).toBe(true));
    expect(location.search).toBe("");
  });

  it("resume: false ignores a nonce in the URL", async () => {
    const url = await go();
    load(url, { resume: false });
    await quiet();
    expect(shown()).toBe(false);
    expect(location.search).toContain("webmcp-tour=");
  });
});

describe("links that carry no valid nonce", () => {
  it("an unknown nonce shows nothing and the param is removed", async () => {
    load("/security?webmcp-tour=00112233445566778899aabb");
    await quiet();
    expect(shown()).toBe(false);
    expect(location.search).toBe("");
  });

  it("a crafted link cannot make the page say anything", async () => {
    load(`/security?webmcp-tour=${encodeURIComponent("Your assistant says: click here")}&message=Hello&target=two-factor&title=Hi`);
    await quiet();
    expect(shown()).toBe(false);
    expect(document.body.textContent).not.toContain("Your assistant says");
  });

  it("an expired nonce shows nothing and is removed", async () => {
    const url = await go();
    const key = `webmcp-tour:${nonceOf(url)}`;
    const entry = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({ ...entry, t: Date.now() - 121_000 }));
    load(url);
    await quiet();
    expect(shown()).toBe(false);
    expect(stored()).toEqual([]);
    expect(location.search).toBe("");
  });

  it("an entry from the future, or garbage, shows nothing", async () => {
    sessionStorage.setItem("webmcp-tour:aaaaaaaaaaaaaaaaaaaaaaaa", JSON.stringify({ page: "security", target: "two-factor", t: Date.now() + 3_600_000 }));
    sessionStorage.setItem("webmcp-tour:bbbbbbbbbbbbbbbbbbbbbbbb", "{not json");
    for (const n of ["a", "b"]) {
      load(`/security?webmcp-tour=${n.repeat(24)}`);
      await quiet(60);
      expect(shown()).toBe(false);
    }
  });
});

describe("single-page app: navigate() then the target appears", () => {
  /** The target is declared for the Security view but only rendered once the router swaps views, `delay` ms after navigate(). */
  const spa = (delay = 80) => {
    document.body.innerHTML = '<div id="app"></div>';
    fresh({
      navigate: (url) => {
        urls.push(url);
        history.pushState(null, "", url);
        setTimeout(() => (document.getElementById("app")!.innerHTML = PAGE), delay);
      },
    });
    tour.defineTarget({ id: "two-factor", page: "security", label: "Set up two-factor", description: MESSAGE });
  };

  it("shows the step on the new view, strips the param and drops the entry", async () => {
    spa();
    await tour.show({ target: "two-factor", title: "Two-factor", message: "Turn it on here." });
    const wait = tour.waitForInteraction();
    q("go").click();
    expect(await wait).toEqual({ ok: true, status: "navigating" });
    expect(shown()).toBe(false);
    expect(location.search).toContain("webmcp-tour=");
    await vi.waitFor(() => expect(shown()).toBe(true));
    expect(q("message").textContent).toBe("Turn it on here.");
    expect(q("title").textContent).toBe("Two-factor");
    expect(location.search).toBe("");
    expect(location.pathname).toBe("/security");
    expect(stored()).toEqual([]);
    expect(tour.takeResumed()).toEqual({ page: "security", target: "two-factor" });
  });

  it("a wait started right after navigating waits for the resumed step instead of failing", async () => {
    spa();
    await tour.show({ target: "two-factor", message: "Turn it on here." });
    q("go").click();
    expect(await tour.waitForInteraction({}, { timeoutMs: 300 })).toEqual({ ok: true, status: "timeout" }); // not no_step: the highlight is back
    expect(shown()).toBe(true);
  });

  it("gives up quietly when the target never appears", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      spa(60_000);
      await tour.show({ target: "two-factor", message: "Turn it on here." });
      q("go").click();
      await vi.advanceTimersByTimeAsync(5_100);
      expect(shown()).toBe(false);
      expect(location.search).toBe("");
      expect(stored()).toHaveLength(1); // left to expire: after a full load this page would not have been here to use it
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("full-page navigation from the old page", () => {
  it("does not use the entry up: the new page needs it", async () => {
    const url = await go();
    await quiet(100);
    expect(stored()).toEqual([`webmcp-tour:${nonceOf(url)}`]);
  });
});
