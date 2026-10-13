/* Keplar app preview helper (draft previews only, never published apps).
   1. Error reports: tells the builder hosting this preview when the app throws, rejects a promise or gets a 5xx from its own
      API, so the studio can offer a one-click fix. At most 8 distinct reports per page load.
   2. Click-to-edit: when the studio turns on pick mode, hovering outlines an element and a click sends a short description of
      it (tag, text, classes, a CSS path, a trimmed outerHTML) so the owner can say what to change. Pick mode swallows clicks
      so nothing in the app runs while choosing. Never reads app data. */
(function () {
  "use strict";
  if (window.__kappReport || window.parent === window) return;
  window.__kappReport = true;
  var seen = {}, sent = 0;
  // Files as the app names them (screens/home.js), not the preview URL they were served from.
  function rel(f) {
    f = String(f || "");
    var base = String(document.baseURI || "").replace(/[^/]*$/, "");
    return (base && f.indexOf(base) === 0 ? f.slice(base.length) : f.replace(/^[a-z]+:\/\/[^/]+/i, "")).slice(0, 160);
  }
  function route() { return (location.hash || "#/").replace(/^#/, "") || "/"; }
  function send(kind, message, file, line) {
    message = String(message || "").slice(0, 400);
    if (!message) return;
    var key = kind + "|" + message + "|" + (file || "") + "|" + (line || "");
    if (seen[key] || sent >= 8) return;
    seen[key] = 1; sent++;
    try { window.parent.postMessage({ source: "keplar-app", type: "error", kind: kind, message: message, file: rel(file), line: line || 0, route: route() }, "*"); } catch (e) { /* ignore */ }
  }
  window.addEventListener("error", function (e) {
    if (e && e.message) send("error", e.message, e.filename, e.lineno);
    else if (e && e.target && e.target !== window && (e.target.src || e.target.href)) send("load", "Could not load " + (e.target.src || e.target.href));
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    send("promise", (r && (r.message || r.toString())) || "A promise was rejected without a reason.");
  });
  var f = window.fetch;
  if (typeof f === "function") {
    window.fetch = function (input, init) {
      return f.apply(this, arguments).then(function (res) {
        try {
          var u = typeof input === "string" ? input : (input && input.url) || "";
          if (res.status >= 500 && /_api\//.test(u)) send("api", "The app's API answered " + res.status + " for " + u.replace(/^.*_api\//, "_api/").split("?")[0]);
        } catch (e) { /* ignore */ }
        return res;
      });
    };
  }

  /* ── click-to-edit ── */
  var picking = false, box = null, tag = null, hovered = null;
  function overlay() {
    if (box) return;
    box = document.createElement("div");
    box.setAttribute("data-kapp-pick", "");
    box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #3b82f6;border-radius:4px;background:rgba(59,130,246,.08);transition:all 60ms ease-out;display:none";
    tag = document.createElement("div");
    tag.setAttribute("data-kapp-pick", "");
    tag.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;padding:2px 6px;border-radius:4px;background:#3b82f6;color:#fff;font:600 11px/1.4 system-ui,sans-serif;display:none";
    document.documentElement.appendChild(box);
    document.documentElement.appendChild(tag);
  }
  function label(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    var c = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (c.length) s += "." + c.join(".");
    return s;
  }
  function cssPath(el) {
    var parts = [];
    for (var n = el, depth = 0; n && n.nodeType === 1 && n !== document.body && depth < 6; n = n.parentElement, depth++) {
      var part = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(part + "#" + n.id); break; }
      var c = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      if (c.length) part += "." + c.join(".");
      var sib = n.parentElement ? Array.prototype.filter.call(n.parentElement.children, function (x) { return x.tagName === n.tagName; }) : [];
      if (sib.length > 1) part += ":nth-of-type(" + (sib.indexOf(n) + 1) + ")";
      parts.unshift(part);
    }
    return parts.join(" > ");
  }
  function show(el) {
    overlay();
    var r = el.getBoundingClientRect();
    box.style.display = tag.style.display = "block";
    box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px";
    tag.textContent = label(el);
    tag.style.left = Math.max(0, r.left) + "px";
    tag.style.top = (r.top > 22 ? r.top - 22 : r.bottom + 4) + "px";
  }
  function hide() { if (box) box.style.display = tag.style.display = "none"; hovered = null; }
  function target(e) {
    var el = e.target;
    while (el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute("data-kapp-pick")) el = el.parentElement;
    return el && el.nodeType === 1 && el !== document.documentElement && el !== document.body ? el : null;
  }
  function onMove(e) { var el = target(e); if (el && el !== hovered) { hovered = el; show(el); } }
  function block(e) { if (picking) { e.preventDefault(); e.stopPropagation(); } }
  function onClick(e) {
    if (!picking) return;
    e.preventDefault(); e.stopPropagation();
    var el = target(e);
    if (!el) return;
    var html = el.outerHTML.replace(/\s+/g, " ");
    try {
      window.parent.postMessage({ source: "keplar-app", type: "pick", tag: el.tagName.toLowerCase(), label: label(el), path: cssPath(el),
        text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200), html: html.length > 700 ? html.slice(0, 700) + "…" : html, route: route() }, "*");
    } catch (x) { /* ignore */ }
  }
  function setPicking(on) {
    if (on === picking) return;
    picking = on;
    var add = on ? "addEventListener" : "removeEventListener";
    document[add]("mousemove", onMove, true);
    document[add]("click", onClick, true);
    ["mousedown", "mouseup", "pointerdown", "pointerup", "submit", "dblclick"].forEach(function (t) { document[add](t, block, true); });
    document.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hide();
  }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.source !== "keplar-studio") return;
    if (d.type === "pick") setPicking(Boolean(d.on));
  });
  document.addEventListener("keydown", function (e) {
    if (picking && e.key === "Escape") { setPicking(false); try { window.parent.postMessage({ source: "keplar-app", type: "pick-cancel" }, "*"); } catch (x) { /* ignore */ } }
  }, true);
  try { window.parent.postMessage({ source: "keplar-app", type: "ready" }, "*"); } catch (e) { /* ignore */ }
})();