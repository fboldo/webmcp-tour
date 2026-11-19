// What the resolver never reveals: hidden values (selector probes), excluded text, typed text; and
// duplicated declared targets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTour } from "../../src/index.js";
import { listTargets, locate, outline } from "../../src/engine/resolver/index.js";

const mount = (html: string): void => {
  document.body.innerHTML = html;
};
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("selector is not a query oracle", () => {
  beforeEach(() =>
    mount(`<main><input type="hidden" name="csrf" value="s3cr3t"><button data-token="abc" data-testid="save" id="save">Save</button><input id="v" value="typed"></main>`),
  );

  const refused = [
    "main:has(input[name=csrf][value^=s3c])",
    "main:HAS(input)",
    "main:has( input )",
    "button[data-token^=a]",
    "button[data-token$=c]",
    "button[data-token*=b]",
    "button[data-token~=abc]",
    "button[data-token|=abc]",
    "input[value=typed]",
    "input[value]",
    "input[ VALUE = typed ]",
    "input[val\\75e^=t]",
    "main:h\\61s(input)",
    ":is(main):not([data-token^=z])",
  ];
  for (const selector of refused)
    it(`refuses ${selector}`, () => {
      const r = locate({ selector });
      expect(r).toMatchObject({ ok: false, error: "invalid_input" });
      expect((r as { message: string }).message).toMatch(/text|target/);
    });

  it("keeps plain selectors, including [attr=x]", () => {
    expect(locate({ selector: "[data-testid=save]" }).ok).toBe(true);
    expect(locate({ selector: "#save" }).ok).toBe(true);
    expect(locate({ selector: "main > button.nope" })).toMatchObject({ error: "not_found" });
  });
});

describe("excluded and hidden text does not leak", () => {
  it("ambiguous candidates' row text skips excluded cells", () => {
    mount(`<table><tr><td data-tour-exclude>ssn 123-45-6789</td><td><button>Edit</button></td></tr><tr><td>b</td><td><button>Edit</button></td></tr></table>`);
    const r = locate({ text: "Edit" });
    expect(JSON.stringify(r)).not.toContain("123-45");
    expect(r).toMatchObject({ error: "ambiguous" });
  });

  it("an excluded or hidden heading does not give context", () => {
    mount(`<div data-tour-exclude><h2>Balance 9,999.00</h2></div><h3 style="display:none">hidden head</h3><button>Pay</button><button>Pay</button>`);
    const r = JSON.stringify(locate({ text: "Pay" }));
    expect(r).not.toContain("9,999");
    expect(r).not.toContain("hidden head");
    expect(JSON.stringify(outline({}))).not.toContain("9,999");
  });

  it("row text drops excluded descendants of the heading and hidden spans", () => {
    mount(`<h2>Plans <span data-tour-exclude>SECRET</span><span style="display:none">HIDDEN</span></h2><button>Go</button><button>Go</button>`);
    const json = JSON.stringify([locate({ text: "Go" }), outline({})]);
    expect(json).not.toMatch(/SECRET|HIDDEN/);
    expect(json).toContain("Plans");
  });

  it("aria-labelledby on an excluded node names nothing", () => {
    mount(`<span id="b" data-tour-exclude>Balance 9,999.00</span><button aria-labelledby="b" id="btn">x</button>`);
    expect(JSON.stringify(outline({}))).not.toContain("9,999");
    const r = locate({ selector: "#btn" });
    expect(r.ok && JSON.stringify(r.matched)).not.toContain("9,999");
  });

  it("aria-labelledby inside an excluded subtree, and excluded children of a hidden reference", () => {
    mount(`<div data-tour-exclude><span id="b">Account 42</span></div>
      <span id="c" style="display:none">Visible part <i data-tour-exclude>EXCLUDED</i></span>
      <button aria-labelledby="b" id="b1">x</button><button aria-labelledby="c" id="b2">y</button>`);
    const json = JSON.stringify(outline({}));
    expect(json).not.toMatch(/Account 42|EXCLUDED/);
    expect(json).toContain("Visible part");
  });

  it("a hidden (not excluded) reference still names, per accname", () => {
    mount(`<span id="l" hidden>Close dialog</span><button aria-labelledby="l">×</button>`);
    expect(outline({}).controls[0]!.name).toBe("Close dialog");
  });
});

describe("typed text never names an element", () => {
  const html = `
    <div id="ce" contenteditable="true">my private draft about divorce</div>
    <div id="tb" role="textbox">secret note</div>
    <div id="cb" role="combobox">chosen: confidential</div>
    <div id="sp" role="spinbutton">12345</div>
    <div id="sb" role="searchbox">my search history</div>
    <textarea id="ta">textarea draft</textarea>
    <input id="in" value="input value">
    <div id="lab" contenteditable="true" aria-label="Notes">typed under a label</div>
    <div id="ph" role="textbox" placeholder="Write here">typed</div>
    <label for="f">Your name</label><div id="f" role="textbox" aria-labelledby="fl">stuff</div><span id="fl">Full name</span>
    <button id="wrap">Open <span contenteditable="true">typed inside</span></button>`;

  it("outline: names come from labels, aria-label, title or placeholder only", () => {
    mount(html);
    const json = JSON.stringify(outline({}));
    expect(json).not.toMatch(/divorce|secret note|confidential|12345|search history|draft|input value|typed under|stuff|typed inside|typed"/);
    expect(json).toContain("Notes");
    expect(json).toContain("Full name");
    expect(json).toContain("Write here");
    expect(json).toContain("Open");
  });

  it("text lookup does not match typed content", () => {
    mount(html);
    for (const t of ["private draft", "secret note", "confidential", "typed under"]) expect(locate({ text: t })).toMatchObject({ error: "not_found" });
    expect(JSON.stringify(locate({ text: "private draft" }))).not.toMatch(/divorce|secret note/);
  });

  it("matched.name and text carry no typed text", () => {
    mount(html);
    for (const sel of ["#ce", "#tb", "#cb", "#ta", "#wrap"]) {
      const r = locate({ selector: sel });
      expect(r.ok && JSON.stringify(r.matched)).not.toMatch(/divorce|secret note|confidential|draft|typed inside/);
    }
  });

  it("near suggestions and ambiguous row text carry none", () => {
    mount(`<div contenteditable="true">zzz typed</div><ul><li>row typed <span role="textbox">in a textbox</span> <button>Do</button></li><li><button>Do</button></li></ul>`);
    const json = JSON.stringify([locate({ text: "nothing here" }), locate({ text: "Do" })]);
    expect(json).not.toMatch(/zzz|in a textbox|typed"/);
  });
});

describe("duplicated data-tour-id", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));

  it("is ambiguous_target, listing both, instead of the first one winning", () => {
    mount(`<a data-tour-id="dup-plan" data-tour-description="Call +1 555 0100" href="#x">Fake</a><button data-tour-id="dup-plan">Change plan</button>`);
    const r = locate({ target: "dup-plan" });
    expect(r).toMatchObject({ ok: false, error: "ambiguous_target", count: 2 });
    const names = (r as { candidates: { name: string }[] }).candidates.map((c) => c.name);
    expect(names).toEqual(["fake", "change plan"]);
    expect(JSON.stringify(r)).not.toContain("555");
  });

  it("warns once per id", () => {
    mount(`<i data-tour-id="dup-warn">a</i><b data-tour-id="dup-warn">b</b>`);
    locate({ target: "dup-warn" });
    locate({ target: "dup-warn" });
    listTargets({});
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain("dup-warn");
  });

  it("duplicates are not listed as targets; one live duplicate still resolves", () => {
    mount(`<i data-tour-id="dup-list" data-tour-description="evil">a</i><b data-tour-id="dup-list">b</b><button data-tour-id="dup-ok">ok</button><span data-tour-exclude><u data-tour-id="dup-ok">x</u></span>`);
    expect(JSON.stringify(listTargets({}))).not.toContain("evil");
    expect(listTargets({}).targets.map((t) => t.id)).toEqual(["dup-ok"]);
    const r = locate({ target: "dup-ok" });
    expect(r.ok && r.element.tagName).toBe("BUTTON");
  });

  it("DOM targets honour scope: an element outside it cannot shadow or duplicate", () => {
    mount(`<a data-tour-id="scoped-x" data-tour-description="outside">out</a><section id="in"><button data-tour-id="scoped-x">in</button></section>`);
    const scope = document.getElementById("in")!;
    const r = locate({ target: "scoped-x" }, { scope });
    expect(r.ok && r.element.tagName).toBe("BUTTON");
    expect(listTargets({ scope }).targets).toHaveLength(1);
  });

  it("tour.show reports it, and domTargets:false ignores data-tour-* markup", async () => {
    mount(`<a data-tour-id="dup-show" data-tour-description="evil">x</a><button id="real" data-tour-id="dup-show">Real</button><button id="only" data-tour-id="only-dom">Only</button>`);
    const tour = createTour();
    expect(await tour.show({ target: "dup-show", message: "m" })).toMatchObject({ ok: false, error: "ambiguous_target" });
    tour.destroy();

    const off = createTour({ domTargets: false });
    expect(await off.show({ target: "only-dom", message: "m" })).toMatchObject({ ok: false, error: "target_not_found" });
    expect(off.targets().targets).toEqual([]);
    const un = off.defineTarget({ id: "real", selector: "#real" });
    expect(await off.show({ target: "real", message: "m" })).toMatchObject({ ok: true });
    un();
    off.destroy();
  });
});
