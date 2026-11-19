// A large admin-style page: text lookup must stay linear, whatever the query.
import { commands } from "vitest/browser";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { locate } from "../../src/engine/resolver/index.js";
import { watch } from "../../src/tour/wait.js";

const input = commands as unknown as { waitInput(selector: string, action: "press", arg?: number): Promise<void> };
const ROWS = 3000;
const BUDGET_MS = 150;

beforeAll(() => {
  const rows: string[] = [];
  for (let i = 0; i < ROWS; i++)
    rows.push(
      `<tr><td>${i}</td><td><span>Customer ${i}</span></td><td><button>Open</button> <button>Delete row ${i}</button></td><td><a href="#r${i}">View details</a></td></tr>`,
    );
  document.body.innerHTML = `<h1>Orders</h1><button id="export">Export everything</button><table><tbody>${rows.join("")}</tbody></table>`;
  void document.body.offsetHeight; // a page is laid out before anyone asks; time the lookup, not the browser's first layout
});

const timed = <T>(fn: () => T): { out: T; ms: number } => {
  const t = performance.now();
  const out = fn();
  return { out, ms: performance.now() - t };
};

describe(`text lookup on a ${ROWS}-row table`, () => {
  it("a unique text resolves fast", () => {
    const { out, ms } = timed(() => locate({ text: "Export everything" }));
    expect(out).toMatchObject({ ok: true });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("an ambiguous exact text (3000 ties) answers fast, with the first candidates and a capped count", () => {
    const { out, ms } = timed(() => locate({ text: "Open" }));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out).toMatchObject({ ok: false, error: "ambiguous", count: 50, truncated: true });
    if (!out.ok && out.error === "ambiguous") expect(out.candidates).toHaveLength(10);
  });

  it("an ambiguous substring text (3000 ties) answers fast", () => {
    const { out, ms } = timed(() => locate({ text: "Delete row" }));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out).toMatchObject({ ok: false, error: "ambiguous" });
  });

  it("prose and links answer fast", () => {
    expect(timed(() => locate({ text: "Customer 2999" })).ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => locate({ text: "View details" })).ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => locate({ text: "nothing like this" })).ms).toBeLessThan(BUDGET_MS);
  });

  it("stays fast when the page also has labelled fields", () => {
    document.body.insertAdjacentHTML("afterbegin", `<label>Search orders <input id="q"></label>`);
    const { out, ms } = timed(() => locate({ text: "Export everything" }));
    expect(out).toMatchObject({ ok: true });
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => locate({ text: "Open" })).ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => locate({ text: "Search orders" })).out).toMatchObject({ ok: true });
    document.querySelector("label")!.remove();
  });

  it("an index still picks among the first candidates", () => {
    const r = locate({ text: "Open", index: 3 });
    expect(r).toMatchObject({ ok: true });
  });
});

describe("a wait by text does not re-scan the page on every press elsewhere", () => {
  it("re-resolves only when the first match is gone", async () => {
    const first = document.getElementById("export")!;
    const other = document.createElement("button");
    other.id = "other";
    other.textContent = "Elsewhere";
    document.body.prepend(other);
    const find = vi.fn(() => null);
    const w = watch(first, find, ["click"], () => ({ tag: "button", name: "x" }), undefined, 200);
    await input.waitInput("#other", "press", 10);
    await input.waitInput("#other", "press", 10);
    expect(find).not.toHaveBeenCalled();
    expect(await w.done).toEqual({ ok: true, status: "timeout" });
    other.remove();
  });
});
