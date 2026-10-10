/**
 * Layout probe run inside the test browser (smoke test): sideways overflow and text drawn over other text.
 *
 * Kept as a plain JS source string, evaluated with page.evaluate(LAYOUT_PROBE), so no bundler or transpiler helper can leak
 * into the browser. Pure DOM reads; it changes nothing on the page.
 *
 * - Sideways overflow is measured on the elements themselves, not only on document.documentElement.scrollWidth: a generated
 *   `html, body { overflow-x: hidden }` hides the scrollbar (scrollWidth stays at the viewport) while the content is still cut
 *   off, and phones can still pan to it. An element counts when its box ends past the viewport and no ancestor below <body>
 *   clips it inside the viewport (a horizontal scroller that itself fits is fine). Only the outermost offenders are reported.
 * - Text overlap: the boxes of the visible text runs of two different elements (neither inside the other) cover each other by
 *   at least a third of the smaller one, compared line box by line box. Fixed-position things (toasts, the badge), hidden, faint (opacity or text alpha
 *   below 0.35) and tiny runs are ignored, so decorative ghost numerals behind a heading do not count.
 */
export type LayoutProbeResult = {
  viewport: number;
  /** The widest right edge of anything on the page, in CSS px (equals the viewport when nothing sticks out). */
  contentWidth: number;
  overflow: boolean;
  /** Outermost elements that stick out past the viewport, e.g. `<div class="sp-style-group"> ends at 701px`. */
  wide: string[];
  /** Pairs of text that overlap, e.g. `"NON-COMMINGLED CAPITAL" <span class="a"> under "FOLIO" <span class="b">`. */
  overlaps: string[];
};

export const LAYOUT_PROBE = `(() => {
  var vw = document.documentElement.clientWidth || window.innerWidth;
  var stop = document.body;
  var cs = function (el) { return getComputedStyle(el); };
  var label = function (el) {
    var c = typeof el.className === "string" && el.className.trim() ? ' class="' + el.className.trim().split(/\\s+/).slice(0, 3).join(" ") + '"' : "";
    return "<" + el.tagName.toLowerCase() + c + ">";
  };
  var hiddenOrFixed = function (el) {
    for (var p = el; p && p !== document.documentElement; p = p.parentElement) {
      var s = cs(p);
      if (s.position === "fixed" || s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden") return true;
    }
    return false;
  };
  var clipped = function (el) {
    for (var p = el.parentElement; p && p !== stop && p !== document.documentElement; p = p.parentElement) {
      if (cs(p).overflowX !== "visible") {
        var r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  var all = Array.prototype.slice.call(stop.querySelectorAll("*"), 0, 4000);
  var offenders = new Set();
  var maxRight = vw;
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (hiddenOrFixed(el) || clipped(el)) continue;
    offenders.add(el);
    if (r.right > maxRight) maxRight = r.right;
  }
  var wide = [];
  offenders.forEach(function (el) {
    if (el.parentElement && offenders.has(el.parentElement)) return;
    var r = el.getBoundingClientRect();
    wide.push(label(el) + (r.right > vw + 1 ? " ends at " + Math.round(r.right) + "px" : " starts at " + Math.round(r.left) + "px"));
  });
  var docWide = Math.max(document.documentElement.scrollWidth, stop.scrollWidth);

  var alpha = function (color) {
    var m = /rgba?\\(([^)]+)\\)/.exec(color || "");
    if (!m) return 1;
    var parts = m[1].split(/[\\s,\\/]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  };
  var faint = function (el) {
    var o = 1;
    for (var p = el; p && p !== document.documentElement; p = p.parentElement) o *= parseFloat(cs(p).opacity || "1");
    return o * alpha(cs(el).color) < 0.35;
  };
  var runs = [];
  var walker = document.createTreeWalker(stop, NodeFilter.SHOW_TEXT);
  var byEl = new Map();
  for (var n = walker.nextNode(); n && byEl.size < 900; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim() || !n.parentElement) continue;
    var tag = n.parentElement.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "OPTION" || tag === "TEXTAREA") continue;
    var list = byEl.get(n.parentElement) || [];
    list.push(n);
    byEl.set(n.parentElement, list);
  }
  byEl.forEach(function (nodes, el) {
    if (hiddenOrFixed(el) || faint(el)) return;
    var range = document.createRange();
    var rects = [];
    for (var k = 0; k < nodes.length; k++) {
      range.selectNodeContents(nodes[k]);
      var lines = range.getClientRects();
      for (var q = 0; q < lines.length; q++) if (lines[q].width * lines[q].height >= 40) rects.push({ l: lines[q].left, t: lines[q].top, r: lines[q].right, b: lines[q].bottom });
    }
    if (!rects.length) return;
    var text = nodes.map(function (x) { return x.nodeValue; }).join(" ").replace(/\\s+/g, " ").trim();
    runs.push({ el: el, rects: rects.slice(0, 40), text: text.length > 40 ? text.slice(0, 39) + "\\u2026" : text });
  });
  // Per line box (getClientRects), so two inline phrases that wrap in one paragraph never count.
  var hit = function (ra, rb) {
    for (var x = 0; x < ra.length; x++) for (var y = 0; y < rb.length; y++) {
      var P = ra[x], Q = rb[y];
      var w = Math.min(P.r, Q.r) - Math.max(P.l, Q.l);
      var h = Math.min(P.b, Q.b) - Math.max(P.t, Q.t);
      if (w > 0 && h > 0 && w * h >= Math.min((P.r - P.l) * (P.b - P.t), (Q.r - Q.l) * (Q.b - Q.t)) / 3) return true;
    }
    return false;
  };
  var overlaps = [];
  for (var a = 0; a < runs.length && overlaps.length < 6; a++) {
    for (var b = a + 1; b < runs.length && overlaps.length < 6; b++) {
      var A = runs[a], B = runs[b];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (!hit(A.rects, B.rects)) continue;
      overlaps.push('"' + A.text + '" ' + label(A.el) + ' and "' + B.text + '" ' + label(B.el));
    }
  }
  return { viewport: vw, contentWidth: Math.round(Math.max(maxRight, docWide)), overflow: docWide > vw + 1 || wide.length > 0, wide: wide.slice(0, 4), overlaps: overlaps };
})()`;
