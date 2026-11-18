// Throwaway text resolver for spike 003. Injected into the page as a plain
// script; defines window.__tourResolve(text, options).
//
// Implements plan.md v2 → tour_show_step → "Resolution order" step 3, the
// visibility rule and the ambiguity rule. Every deviation from the plan is
// behind an option flag (all off = the plan as written) so the corpus can
// measure each proposed rule change on its own.
(() => {
  const INTERACTIVE = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
    "[contenteditable='']", "[contenteditable=true]", "[tabindex]:not([tabindex='-1'])",
    ...["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox",
      "menuitemradio", "option", "combobox", "textbox", "searchbox", "slider", "spinbutton",
      "treeitem"].map((r) => `[role=${r}]`),
  ].join(",");
  const TABINDEX_ONLY = "[tabindex]:not([tabindex='-1'])";
  const LANDMARK = /^(MAIN|NAV|ASIDE|HEADER|FOOTER|SECTION|ARTICLE|BODY|FORM)$/;
  const EXCLUDED = "[aria-hidden=true],[inert],script,style,template,noscript,[data-webmcp-tour-root]";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK"]);
  const FIELD_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

  // NFKC, whitespace collapse, trailing punctuation + ellipsis stripped,
  // case-insensitive, no locale rules.
  const clean = (s) =>
    (s || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(\s*(\.\.\.|…|[.,:;!?]))+$/u, "")
      .trim();
  const norm = (s) => clean(s).toLowerCase();
  const WORD = /[\p{L}\p{N}_]/u;

  const parentComposed = (el) => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const composedClosest = (el, sel) => {
    for (let n = el; n; n = parentComposed(n)) if (n.matches(sel)) return n;
    return null;
  };
  // Nearest interactive ancestor. With leafTabindex, an element that is
  // interactive only through tabindex (scroll regions, <main tabindex=0>)
  // counts only if it is not a landmark and contains no other control.
  const interactiveAncestor = (el, opts) => {
    for (let n = el; n; n = parentComposed(n)) {
      if (!n.matches(INTERACTIVE)) continue;
      if (!opts.leafTabindex) return n;
      const strict = n.matches(INTERACTIVE.replace(TABINDEX_ONLY + ",", ""));
      if (strict) return n;
      if (!LANDMARK.test(n.tagName) && !n.querySelector(INTERACTIVE)) return n;
    }
    return null;
  };
  const composedContains = (a, b) => {
    for (let n = b; n; n = parentComposed(n)) if (n === a) return true;
    return false;
  };

  const isVisible = (el, opts) => {
    // Custom-styled checkboxes/radios/dropdowns keep the native control as
    // an opacity:0 click target over a styled proxy: with opacityFields the
    // opacity check is skipped for native form controls.
    const opacity = !(opts.opacityFields && FIELD_TAGS.has(el.tagName));
    if (!el.checkVisibility({ opacityProperty: opacity, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    if (opts.strictVisibility) {
      // Reject the visually-hidden (sr-only) pattern and off-document boxes
      // (skip links parked at -9999px, etc.).
      if (r.width < 4 && r.height < 4) return false;
      const sx = window.scrollX, sy = window.scrollY;
      if (r.right + sx <= 0 || r.bottom + sy <= 0) return false;
      const cs = getComputedStyle(el);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)") return false;
    }
    return true;
  };

  function contentText(node, cache) {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    if (cache.has(el)) return cache.get(el);
    let out = "";
    if (SKIP_TAGS.has(el.tagName) || el.getAttribute("aria-hidden") === "true") out = "";
    else {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") out = "";
      else if (el.tagName === "IMG") out = el.getAttribute("alt") || "";
      else if (el.tagName === "svg" || el instanceof SVGSVGElement) {
        const t = el.querySelector("title");
        out = t ? t.textContent : "";
      } else if (FIELD_TAGS.has(el.tagName)) {
        out = el.tagName === "INPUT" && /^(submit|button|reset)$/i.test(el.type) ? el.value : "";
      } else if (el.hasAttribute("aria-label") && el.getAttribute("aria-label").trim()) {
        out = el.getAttribute("aria-label");
      } else {
        out = childrenText(el, cache);
        if (!/^inline/.test(cs.display) && cs.display !== "contents") out = ` ${out} `;
      }
    }
    cache.set(el, out);
    return out;
  }

  // Flat-tree text of an element's children (shadow root + slotted nodes).
  function childrenText(el, cache) {
    const kids = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
    return [...kids].map((k) => {
      if (k.tagName === "SLOT") {
        const assigned = k.assignedNodes({ flatten: true });
        return (assigned.length ? assigned : [...k.childNodes]).map((a) => contentText(a, cache)).join("");
      }
      return contentText(k, cache);
    }).join("");
  }

  const idText = (el, ids, cache) =>
    ids.split(/\s+/).map((id) => {
      const ref = el.getRootNode().getElementById?.(id) ?? document.getElementById(id);
      return ref ? contentText(ref, cache) || ref.textContent : "";
    }).join(" ");

  // Name-from-content of the element itself (fields and images have none).
  const ownContent = (el, cache) =>
    FIELD_TAGS.has(el.tagName) || el.tagName === "IMG" || el instanceof SVGElement
      ? (el.tagName === "INPUT" && /^(submit|button|reset)$/i.test(el.type) ? el.value : "")
      : childrenText(el, cache);

  // Simplified accessible name: aria-labelledby > aria-label > <label> >
  // text content > title/alt/SVG <title> > placeholder.
  function accName(el, cache) {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const t = idText(el, lb, cache); if (t.trim()) return { name: t, source: "aria-labelledby" }; }
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return { name: al, source: "aria-label" };
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map((l) => contentText(l, cache)).join(" ");
      if (t.trim()) return { name: t, source: "label" };
    }
    const c = ownContent(el, cache);
    if (c.trim()) return { name: c, source: "content" };
    const svgTitle = el instanceof SVGElement ? el.querySelector(":scope > title")?.textContent : null;
    const t = el.getAttribute("title") || el.getAttribute("alt") || svgTitle;
    if (t && t.trim()) return { name: t, source: "title" };
    const ph = el.getAttribute("placeholder");
    if (ph && ph.trim()) return { name: ph, source: "placeholder" };
    return { name: "", source: "none" };
  }

  function score(name, q, rawQuery) {
    const n = norm(name);
    if (!n) return null;
    if (n === q) return { tier: 0, ratio: 1, caseExact: clean(name) === clean(rawQuery) };
    let i = n.indexOf(q);
    while (i !== -1) {
      const before = i === 0 ? "" : n[i - 1];
      const after = n[i + q.length] ?? "";
      if (!WORD.test(before) && !WORD.test(after)) return { tier: 1, ratio: q.length / n.length };
      i = n.indexOf(q, i + 1);
    }
    return null;
  }

  function* allElements(root) {
    for (const el of root.querySelectorAll("*")) {
      yield el;
      if (el.shadowRoot) yield* allElements(el.shadowRoot);
    }
  }

  const NAMING = "[aria-label],[aria-labelledby],[title],[alt],[placeholder],input,select,textarea,svg";

  // Candidate context for `ambiguous`: row text, the nearest *preceding*
  // heading in document order, the nearest labelled landmark, and position.
  function context(el) {
    const clip = (s) => (s ? norm(s).slice(0, 60) : undefined);
    const row = composedClosest(el, "tr,[role=row],li");
    let start = el;
    while (start.getRootNode() instanceof ShadowRoot) start = start.getRootNode().host;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    walker.currentNode = start;
    let heading = null;
    for (let n = walker.previousNode(), i = 0; n && i < 5000; n = walker.previousNode(), i++) {
      if (n.matches("h1,h2,h3,h4,h5,h6,[role=heading]") && n.checkVisibility()) { heading = n; break; }
    }
    const landmark = composedClosest(el, "nav[aria-label],[role=navigation][aria-label],aside[aria-label],section[aria-label],form[aria-label],[role=region][aria-label],header,footer,nav,aside");
    const r = el.getBoundingClientRect();
    return {
      row: clip(row && row !== el ? row.innerText : null),
      heading: clip(heading?.innerText),
      landmark: landmark ? clip(landmark.getAttribute("aria-label") || landmark.tagName.toLowerCase()) : undefined,
      pos: `${Math.round(r.x + scrollX)},${Math.round(r.y + scrollY)}`,
    };
  }

  window.__tourResolve = function resolve(text, options = {}) {
    const opts = { ...options };
    const t0 = performance.now();
    const q = norm(text);
    if (!q) return { ok: false, error: "invalid_input" };
    const cache = new Map();
    const hits = new Map(); // target -> best hit

    for (const el of allElements(document)) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      // Cheap prefilter: text content could contain the query, or the
      // element carries a naming attribute / is a host / labelled field.
      const naming = el.matches(NAMING) || !!el.shadowRoot || (el.labels && el.labels.length);
      if (!naming && !norm(el.textContent).includes(q)) continue;
      if (composedClosest(el, EXCLUDED)) continue;
      if (!isVisible(el, opts)) continue;

      const names = [accName(el, cache)];
      if (opts.visibleTextToo && names[0].source !== "content") {
        // WCAG 2.5.3 label-in-name: what the user sees is also a name.
        const c = ownContent(el, cache);
        if (c.trim()) names.push({ name: c, source: "content" });
      }
      let best = null;
      for (const n of names) {
        const s = score(n.name, q, text);
        if (s && (!best || s.tier < best.tier || (s.tier === best.tier && s.ratio > best.ratio))) best = { ...s, ...n };
      }
      if (!best) continue;

      let target = interactiveAncestor(el, opts) || el;
      if (opts.labelToControl) {
        const label = composedClosest(el, "label");
        if (label && !interactiveAncestor(el, opts)) target = label.control && isVisible(label.control, opts) ? label.control : label;
      }
      const prev = hits.get(target);
      if (!prev || best.tier < prev.tier || (best.tier === prev.tier && best.ratio > prev.ratio)) hits.set(target, { ...best, el });
    }

    // Ancestor collapse: drop any target that contains another target.
    let list = [...hits.entries()].map(([target, h]) => ({ target, ...h }));
    list = list.filter((a) => !list.some((b) => b !== a && composedContains(a.target, b.target)));

    const ms = performance.now() - t0;
    if (!list.length) return { ok: false, error: "not_found", ms, scanned: cache.size };

    const top = Math.min(...list.map((h) => h.tier));
    let tier = list.filter((h) => h.tier === top);
    if (opts.preferInteractive) {
      const inter = tier.filter((h) => h.target.matches(INTERACTIVE));
      if (inter.length) tier = inter;
    }
    if (opts.substringInteractiveOnly && top === 1) {
      // Substring hits on non-interactive text (prose) are not candidates.
      tier = tier.filter((h) => h.target.matches(INTERACTIVE));
      if (!tier.length) return { ok: false, error: "not_found", ms, scanned: cache.size };
    }
    if (opts.caseTiebreak && top === 0 && tier.length > 1) {
      const cased = tier.filter((h) => h.caseExact);
      if (cased.length) tier = cased;
    }
    if (opts.substringBest && top === 1 && tier.length > 1) {
      tier.sort((a, b) => b.ratio - a.ratio);
      if (tier[0].ratio >= opts.substringBest * tier[1].ratio) tier = [tier[0]];
    }

    const describe = (h) => ({
      tag: h.target.tagName.toLowerCase(),
      role: h.target.getAttribute("role") || undefined,
      name: norm(accName(h.target, cache).name).slice(0, 80),
      tier: h.tier === 0 ? "exact" : "substring",
      ratio: Math.round(h.ratio * 100) / 100,
      source: h.source,
      disabled: h.target.matches(":disabled,[aria-disabled=true]"),
      ...context(h.target),
    });

    let chosen = null;
    if (opts.index != null) chosen = tier[opts.index] ?? null;
    else if (tier.length === 1) chosen = tier[0];

    window.__tourLast = { chosen: chosen?.target ?? null, candidates: tier.map((h) => h.target) };
    if (!chosen) {
      return { ok: false, error: "ambiguous", ms, candidates: tier.slice(0, 10).map(describe), count: tier.length };
    }
    const r = chosen.target.getBoundingClientRect();
    return {
      ok: true, ms,
      matched: { by: "text", ...describe(chosen), inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth },
    };
  };
})();
