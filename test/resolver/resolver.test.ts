import { afterEach, describe, expect, it } from "vitest";
import { locate, resolve } from "../../src/engine/resolver/index.js";
import type { LocateResult } from "../../src/engine/resolver/index.js";

const mount = (html: string, host: ParentNode = document.body): HTMLElement => {
  const box = document.createElement("div");
  box.innerHTML = html;
  (host as Element).append(box);
  return box;
};
afterEach(() => {
  document.body.replaceChildren();
  window.scrollTo(0, 0);
});

const text = (t: string, extra: object = {}, opts = {}) => locate({ text: t, ...extra }, opts);
const el = (r: LocateResult): Element => {
  if (!r.ok) throw new Error(`expected a match, got ${r.error}`);
  return r.element;
};
const err = (r: LocateResult): string => (r.ok ? "match" : r.error);

describe("input validation", () => {
  it("needs exactly one locator", () => {
    expect(err(locate({}))).toBe("invalid_input");
    expect(err(locate({ text: "a", selector: "b" }))).toBe("invalid_input");
    expect(err(locate({ text: "" }))).toBe("invalid_input");
    expect(err(locate({ text: "..." }))).toBe("invalid_input");
    expect(err(locate({ text: "x".repeat(201) }))).toBe("invalid_input");
    expect(err(locate({ text: "a", index: -1 }))).toBe("invalid_input");
    expect(err(locate({ text: "a", index: 1.5 }))).toBe("invalid_input");
  });
});

describe("text: normalization and ranking", () => {
  it("NFKC, whitespace, trailing punctuation and case", () => {
    mount(`<button id=b>Ｓave   changes…</button>`);
    expect(el(text("save CHANGES")).id).toBe("b");
    expect(el(text("Save changes.")).id).toBe("b");
    expect(el(text("Save changes!!!")).id).toBe("b");
  });

  it("aria-label beats text content; aria-labelledby beats aria-label", () => {
    mount(`<span id=n>Open menu</span>
      <button id=a aria-label="Settings">Gear</button>
      <button id=b aria-labelledby="n" aria-label="x">y</button>`);
    expect(el(text("Settings")).id).toBe("a");
    expect(err(text("Gear"))).toBe("not_found");
    expect(el(text("Open menu")).id).toBe("b");
  });

  it("falls back to title, alt and placeholder", () => {
    mount(`<button id=t title="Help"></button><input id=p placeholder="Find a thing"><a href=# id=i><img alt="Home"></a>`);
    expect(el(text("Help")).id).toBe("t");
    expect(el(text("Find a thing")).id).toBe("p");
    expect(el(text("Home")).id).toBe("i");
  });

  it("prefers exact over substring and never auto-picks two substring hits", () => {
    mount(`<a href=# id=a>comments</a><a href=# id=b>177 comments</a>`);
    expect(el(text("comments")).id).toBe("a");
    mount(`<a href=# id=c>VS Code</a><a href=# id=d>Code Beta</a>`, document.body);
    const r = text("code");
    expect(err(r)).toBe("ambiguous");
  });

  it("substring needs word boundaries", () => {
    mount(`<button>Subscribe</button>`);
    expect(err(text("scribe"))).toBe("not_found");
    expect(err(text("Subscribe now"))).toBe("not_found");
  });

  it("case never breaks a tie", () => {
    mount(`<button>Get a Demo</button><button>Get a demo</button>`);
    expect(err(text("get a demo"))).toBe("ambiguous");
  });
});

describe("text: collapse and tiers", () => {
  it("label collapse: a label resolves to its visible control", () => {
    mount(`<label for=u>Username</label><input id=u><label>Email address (optional)<input id=e></label>`);
    expect(el(text("Username")).id).toBe("u");
    expect(el(text("Email address (optional)")).id).toBe("e");
  });

  it("label with a hidden control resolves to the label itself", () => {
    mount(`<label for=h id=l>Newsletter</label><input id=h type=checkbox style="display:none">`);
    expect(el(text("Newsletter")).id).toBe("l");
  });

  it("collapses to the nearest interactive ancestor", () => {
    mount(`<button id=b><span>Save</span></button>`);
    expect(el(text("Save")).id).toBe("b");
  });

  it("tabindex containers are not controls", () => {
    mount(`<main tabindex=0 id=m><label for=c>Checkbox one</label><input id=c type=checkbox></main>
      <pre tabindex=0 id=pre>const x = Copy</pre>`);
    expect(el(text("Checkbox one")).id).toBe("c");
  });

  it("a leaf tabindex element is a control", () => {
    mount(`<div tabindex=0 id=d><span>Drag me</span></div>`);
    expect(el(text("Drag me")).id).toBe("d");
  });

  it("prefers interactive within the top tier", () => {
    mount(`<h2>Readme</h2><button role=tab id=t>Readme</button>`);
    expect(el(text("Readme")).id).toBe("t");
  });

  it("a lone non-interactive exact match is valid", () => {
    mount(`<h3 id=h>Weekly Downloads</h3>`);
    expect(el(text("Weekly Downloads")).id).toBe("h");
  });

  it("prose substring hits are not_found", () => {
    mount(`<p>Welcome to our visitors centre</p><p>More visitors info</p>`);
    expect(err(text("visitors"))).toBe("not_found");
  });
});

describe("visibility", () => {
  it("skips display:none, visibility:hidden, aria-hidden and inert", () => {
    mount(`<button style="display:none">A</button><button style="visibility:hidden">A</button>
      <button aria-hidden=true>A</button><div inert><button>A</button></div>`);
    expect(err(text("A"))).toBe("not_found");
  });

  it("opacity:0 hides non-fields but not native form controls", () => {
    mount(`<button style="opacity:0">Ghost</button><input type=checkbox id=c aria-label="Dark mode" style="opacity:0">`);
    expect(err(text("Ghost"))).toBe("not_found");
    expect(el(text("Dark mode")).id).toBe("c");
  });

  it("rejects sr-only, tiny and parked boxes", () => {
    mount(`<a href=# style="position:absolute;top:-320px;left:0">Skip to main content</a>
      <a href=# style="position:absolute;width:1px;height:1px;clip:rect(0 0 0 0)">Hidden link</a>
      <a href=# style="position:absolute;width:1px;height:1px;clip-path:inset(50%)">Hidden two</a>
      <a href=# style="position:absolute;width:2px;height:2px;overflow:hidden">Tiny</a>`);
    for (const t of ["Skip to main content", "Hidden link", "Hidden two", "Tiny"]) expect(err(text(t))).toBe("not_found");
  });

  it("perceivability-rejected content still names its ancestors", () => {
    mount(`<button id=b><span style="position:absolute;width:1px;height:1px;clip:rect(0 0 0 0)">Close</span>X</button>`);
    expect(el(text("Close X")).id).toBe("b");
  });

  it("a box parked above the document is rejected even after scrolling", () => {
    mount(`<div style="height:3000px"></div>`);
    window.scrollTo(0, 500);
    mount(`<p>Other text</p><button style="position:absolute;top:-400px">Parked</button>`);
    expect(err(text("Parked"))).toBe("not_found");
  });
});

describe("exclusions and scope", () => {
  it("honours data-tour-exclude on the element and its subtree", () => {
    mount(`<button data-tour-exclude>Delete account</button><div data-tour-exclude><button>Wipe</button></div>`);
    expect(err(text("Delete account"))).toBe("not_found");
    expect(err(text("Wipe"))).toBe("not_found");
    expect(err(locate({ selector: "button" }))).toBe("not_found");
  });

  it("never resolves the overlay host", () => {
    const box = mount(`<div id=host data-webmcp-tour-root><button>Next</button></div><div id=h2><button>Back</button></div>`);
    expect(err(text("Next"))).toBe("not_found");
    const h2 = box.querySelector("#h2")!;
    expect(err(text("Back", {}, { overlayHost: h2 }))).toBe("not_found");
  });

  it("scope and exclude options", () => {
    const box = mount(`<section id=in><button id=a>Save</button><button id=x class=nope>Edit</button></section><button>Save</button>`);
    const scope = box.querySelector("#in")!;
    expect(el(text("Save", {}, { scope })).id).toBe("a");
    expect(err(text("Edit", {}, { scope, exclude: ".nope" }))).toBe("not_found");
    expect(() => text("Save", {}, { exclude: "[" })).toThrow(TypeError);
  });

  it("a label never leads to an excluded control", () => {
    mount(`<label for=s>Secret</label><input id=s data-tour-exclude>`);
    expect(el(text("Secret")).tagName).toBe("LABEL");
  });
});

describe("shadow DOM", () => {
  it("walks open shadow roots and slots", () => {
    const host = document.createElement("sl-button");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<button part=base><slot></slot></button>`;
    host.textContent = "Primary";
    document.body.append(host);
    expect(el(text("Primary")).tagName).toBe("BUTTON");
    expect(el(locate({ selector: "button" })).getRootNode()).toBe(root);
  });

  it("does not see closed roots", () => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "closed" }).innerHTML = `<button>Closed</button>`;
    document.body.append(host);
    expect(err(text("Closed"))).toBe("not_found");
  });
});

describe("selector and target", () => {
  it("filters to visible elements, reports invalid selectors, and never says hidden exists", () => {
    mount(`<button class=x id=a>One</button><button class=x style="display:none">Two</button>`);
    expect(el(locate({ selector: ".x" })).id).toBe("a");
    expect(err(locate({ selector: "[[" }))).toBe("invalid_selector");
    expect(err(locate({ selector: ".missing" }))).toBe("not_found");
  });

  it("ambiguous selector + index", () => {
    mount(`<button class=x id=a>One</button><button class=x id=b>Two</button>`);
    const r = locate({ selector: ".x" });
    expect(err(r)).toBe("ambiguous");
    expect(el(locate({ selector: ".x", index: 1 })).id).toBe("b");
    expect(err(locate({ selector: ".x", index: 2 }))).toBe("invalid_input");
  });

  it("declared targets: found, hidden with reveal hint, unknown with available ids, excluded", () => {
    mount(`<button data-tour-id=save id=s>Save</button>
      <button data-tour-id=adv data-tour-reveal="Open Settings first" style="display:none">Adv</button>
      <button data-tour-id=secret data-tour-exclude>Secret</button>`);
    expect(el(locate({ target: "save" })).id).toBe("s");
    const hidden = locate({ target: "adv" });
    expect(hidden).toEqual({ ok: false, error: "not_visible", reveal: "Open Settings first" });
    const missing = locate({ target: "nope" });
    expect(missing).toEqual({ ok: false, error: "target_not_found", available: ["save", "adv"] });
    expect(err(locate({ target: "secret" }))).toBe("target_not_found");
  });

  it("custom target sources (defineTarget)", () => {
    const box = mount(`<button id=b>Go</button>`);
    const b = box.querySelector("#b")!;
    const targets = { get: (id: string) => (id === "go" ? { element: b } : null), ids: () => ["go"] };
    expect(el(locate({ target: "go" }, { targets })).id).toBe("b");
  });
});

describe("ambiguity and candidate context", () => {
  it("returns candidates with heading, row and landmark, and index settles it", () => {
    mount(`<nav aria-label="Main"><h2>Invoices</h2>
      <table><tr><td>INV-1</td><td><button>Delete</button></td></tr><tr><td>INV-2</td><td><button>Delete</button></td></tr></table></nav>`);
    const r = text("Delete");
    expect(r.ok).toBe(false);
    if (r.ok || r.error !== "ambiguous") throw new Error("expected ambiguous");
    expect(r.count).toBe(2);
    expect(r.candidates.map((c) => c.row)).toEqual(["inv-1 delete", "inv-2 delete"]);
    expect(r.candidates[0]).toMatchObject({ index: 0, tag: "button", role: "button", name: "delete", heading: "invoices", landmark: "main", disabled: false });
    const second = el(text("Delete", { index: 1 }));
    expect(second.closest("tr")!.textContent).toContain("INV-2");
  });

  it("candidate lists are capped", () => {
    mount(Array.from({ length: 15 }, () => `<button>Same</button>`).join(""));
    const r = text("Same");
    if (r.ok || r.error !== "ambiguous") throw new Error("expected ambiguous");
    expect(r.candidates).toHaveLength(10);
    expect(r.count).toBe(15);
  });
});

describe("not_found near", () => {
  it("lists visible interactive names only, ranked by shared words", () => {
    mount(`<button>Change password</button><button>Billing plan</button><button style="display:none">Hidden thing</button>
      <p>Some prose</p><button data-tour-exclude>Danger</button>`);
    const r = text("Change plan");
    if (r.ok || r.error !== "not_found") throw new Error("expected not_found");
    expect(r.near).toEqual(["change password", "billing plan"]);
  });
});

describe("envelope and security", () => {
  it("reports disabled and never echoes attribute values", () => {
    mount(`<button id=b disabled data-secret="tok_123" value="v" class="c1">Pay</button><a href="https://x.test/?csrf=abc">Link</a>`);
    const r = resolve({ text: "Pay" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched).toMatchObject({ by: "text", tag: "button", role: "button", name: "pay", text: "pay", disabled: true });
    const json = JSON.stringify(r.matched);
    for (const s of ["tok_123", "c1", "csrf"]) expect(json).not.toContain(s);
    const amb = locate({ selector: "button, a" });
    expect(JSON.stringify(amb)).not.toMatch(/tok_123|csrf|https/);
  });

  it("never echoes input values", () => {
    mount(`<input id=p type=password value="hunter2" aria-label="Password">`);
    const r = resolve({ text: "Password" });
    expect(JSON.stringify(r.ok ? r.matched : r)).not.toContain("hunter2");
  });
});

describe("reveal: scrolling and occlusion", () => {
  it("scrolls off-screen elements into view and reports it", () => {
    mount(`<div style="height:3000px"></div><button id=far>Far away</button><div style="height:3000px"></div>`);
    const r = resolve({ text: "Far away" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched).toMatchObject({ inViewport: false, scrolledIntoView: true, occluded: false });
    expect(window.scrollY).toBeGreaterThan(0);
  });

  it("reports an in-viewport element without scrolling", () => {
    mount(`<button>Near</button>`);
    const r = resolve({ text: "Near" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched).toMatchObject({ inViewport: true, scrolledIntoView: false, occluded: false });
  });

  it("reports a permanently covered element as occluded", () => {
    mount(`<button style="position:absolute;top:100px;left:100px;width:80px;height:30px">Covered</button>
      <div style="position:fixed;inset:0;background:#fff;z-index:10"></div>`);
    const r = resolve({ text: "Covered" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched.occluded).toBe(true);
  });

  it("scrolls past a sticky header that covers the element", () => {
    mount(`<div style="position:fixed;top:0;left:0;right:0;height:120px;background:#fff;z-index:10"></div>
      <div style="height:2000px"></div><button id=t style="margin-bottom:2000px">Target</button>`);
    const r = resolve({ text: "Target" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched.occluded).toBe(false);
  });

  it("is not occluded by its own descendants, labels or the overlay host", () => {
    mount(`<button id=b style="width:100px;height:40px"><span style="display:block;width:100px;height:40px">Inner</span></button>
      <div data-webmcp-tour-root style="position:fixed;inset:0;z-index:20"></div>`);
    const r = resolve({ selector: "#b" });
    if (!r.ok) throw new Error(r.error);
    expect(r.matched.occluded).toBe(false);
  });

  it("locate does not scroll", () => {
    mount(`<div style="height:3000px"></div><button>Far</button>`);
    expect(locate({ text: "Far" }).ok).toBe(true);
    expect(window.scrollY).toBe(0);
  });
});
