// Capability detection shared by the demo and the examples (examples/shared/webmcp-env.js).
import { afterEach, beforeAll, describe, expect, it } from "vitest";

type Env = { detect(): { mode: string; status: string; load: boolean }; render(e: object): void };
const env = () => (window as unknown as { webmcpEnv: Env }).webmcpEnv;

describe("detect()", () => {
  const secure = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext")!;
  beforeAll(async () => {
    // @ts-expect-error a plain script, no types
    await import("../examples/shared/webmcp-env.js"); // without data-polyfill it only defines window.webmcpEnv
  });
  afterEach(() => {
    delete (document as any).modelContext;
    Object.defineProperty(globalThis, "isSecureContext", secure);
    history.replaceState(null, "", location.pathname);
    document.getElementById("webmcp-status")?.remove();
  });

  it("loads the polyfill where the browser has no WebMCP", () => {
    expect(env().detect()).toEqual({ mode: "polyfill", status: "Polyfill (in-page agents only)", load: true });
  });

  it("uses native WebMCP and installs nothing", () => {
    Object.defineProperty(document, "modelContext", { value: {}, configurable: true });
    expect(env().detect()).toEqual({ mode: "native", status: "Native WebMCP", load: false });
    history.replaceState(null, "", "?webmcp=polyfill"); // the polyfill never installs over native
    expect(env().detect().mode).toBe("native");
  });

  it("says so in an insecure context", () => {
    Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true });
    expect(env().detect()).toEqual({ mode: "insecure", status: "Not a secure context", load: false });
  });

  it("?webmcp=native never loads the polyfill", () => {
    history.replaceState(null, "", "?webmcp=native");
    expect(env().detect()).toMatchObject({ mode: "none", load: false });
  });

  it("?webmcp=polyfill loads it", () => {
    history.replaceState(null, "", "?webmcp=polyfill");
    expect(env().detect()).toMatchObject({ mode: "polyfill", load: true });
  });

  it("render() writes one status line, excluded from the tour", () => {
    env().render(env().detect());
    env().render({ mode: "native", status: "Native WebMCP" });
    const el = document.querySelectorAll("#webmcp-status");
    expect(el).toHaveLength(1);
    expect(el[0]!.textContent).toBe("Native WebMCP");
    expect(el[0]!.hasAttribute("data-tour-exclude")).toBe(true);
  });
});

describe("the script on a page (data-polyfill)", () => {
  const frames: HTMLIFrameElement[] = [];
  afterEach(() => frames.splice(0).forEach((f) => f.remove()));
  async function open(query = "") {
    const f = document.createElement("iframe");
    f.src = `/fx/env.html${query}`;
    document.body.append(f);
    frames.push(f);
    await new Promise((r) => f.addEventListener("load", r, { once: true }));
    return f.contentWindow as Window & typeof globalThis & { webmcpMode?: string };
  }

  it("loads the polyfill synchronously, so the next script sees document.modelContext", async () => {
    const win = await open();
    expect(win.webmcpMode).toBe("polyfill");
    expect(typeof (win.document as any).modelContext?.registerTool).toBe("function");
    expect(win.document.getElementById("webmcp-status")!.textContent).toBe("Polyfill (in-page agents only)");
  });

  it("?webmcp=native loads nothing and says so", async () => {
    const win = await open("?webmcp=native");
    expect(win.webmcpMode).toBe("none");
    expect("modelContext" in win.document).toBe(false);
    expect(win.document.getElementById("webmcp-status")!.textContent).toContain("Native WebMCP requested");
  });
});
