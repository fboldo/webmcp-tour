// WebMCP capability detection for the demo and the examples. A classic script, loaded before the tour.
//   native WebMCP (document.modelContext exists)  -> use it, install nothing
//   otherwise, in a secure context                -> load the W3C polyfill (in-page agents and the tool tester only)
//   not a secure context                          -> nothing can work; say so
// Override for testing: ?webmcp=native (never polyfill) or ?webmcp=polyfill (polyfill; it never installs over native).
// With `data-polyfill="<url>"` on its tag it runs by itself: writes the polyfill tag synchronously (so the next script sees
// document.modelContext) and shows the status line. Without it, `window.webmcpEnv` is the API (used by the bundled example).
(() => {
  const detect = () => {
    const forced = new URLSearchParams(location.search).get("webmcp");
    const native = !!document.modelContext;
    if (!window.isSecureContext) return { mode: "insecure", status: "Not a secure context", load: false };
    if (native) return { mode: "native", status: "Native WebMCP", load: false };
    if (forced === "native") return { mode: "none", status: "Native WebMCP requested, but this browser has none", load: false };
    return { mode: "polyfill", status: "Polyfill (in-page agents only)", load: true };
  };
  const render = (env) => {
    const put = () => {
      let el = document.getElementById("webmcp-status");
      if (!el) {
        el = document.createElement("p");
        el.id = "webmcp-status";
        el.style.cssText = "position:fixed;left:12px;bottom:12px;margin:0;padding:3px 8px;z-index:10;background:#fff;color:#111;border:1px solid #888;border-radius:6px;font:12px system-ui,sans-serif";
        document.body.append(el);
      }
      el.setAttribute("role", "status");
      el.setAttribute("data-tour-exclude", "");
      el.dataset.mode = env.mode;
      el.textContent = env.status;
    };
    if (document.body) put();
    else document.addEventListener("DOMContentLoaded", put, { once: true });
  };
  window.webmcpEnv = { detect, render };

  const tag = document.currentScript;
  const url = tag?.getAttribute("data-polyfill");
  if (!url) return;
  const env = detect();
  window.webmcpMode = env.mode;
  if (env.load) document.write(`<script src="${url}"><\/script>`);
  render(env);
})();
