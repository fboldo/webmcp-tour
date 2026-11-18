// Node-side half of the wait tests: real input through Playwright, and the
// browser's own count of the listeners on the tester window (CDP).
import type { BrowserCommand } from "vitest/node";

/** `press` is a real mouse press held for `arg` ms (`force` skips Playwright's checks); `key` presses a key on the focused element; `type` types text key by key; `blur` leaves the field. */
export const waitInput: BrowserCommand<[selector: string, action: "press" | "force" | "key" | "type" | "blur", arg?: string | number]> = async (ctx, selector, action, arg) => {
  const loc = ctx.iframe.locator(selector);
  if (action === "press") await loc.click({ delay: Number(arg ?? 80) });
  else if (action === "key") await loc.press(String(arg));
  else if (action === "force") await loc.click({ delay: Number(arg ?? 80), force: true });
  else if (action === "type") await loc.pressSequentially(String(arg));
  else await loc.blur();
};

/** How many listeners of these types the tester window has, as DevTools counts them. -1 outside Chromium. */
export const windowListeners: BrowserCommand<[types: string[]]> = async (ctx, types) => {
  if (ctx.provider.name !== "playwright" || (ctx.page.context().browser()?.browserType().name() ?? "") !== "chromium") return -1;
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  try {
    // The tester iframe's own window, not the runner page's.
    const contexts: { id: number; auxData?: { frameId?: string; isDefault?: boolean } }[] = [];
    cdp.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
    await cdp.send("Runtime.enable");
    const url = (await ctx.frame()).url().split("#")[0];
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const tester = (frameTree.childFrames ?? []).find((f) => f.frame.url.split("#")[0] === url);
    const find = () => contexts.find((c) => c.auxData?.isDefault && c.auxData.frameId === tester?.frame.id);
    for (let i = 0; i < 50 && !find(); i++) await new Promise((r) => setTimeout(r, 20));
    const context = find();
    if (!context) throw new Error("cannot find the tester frame");
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window", contextId: context.id });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
    return listeners.filter((l) => types.includes(l.type)).length;
  } finally {
    await cdp.detach();
  }
};
