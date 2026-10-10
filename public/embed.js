/**
 * Keplar Ask embed loader (BETA).
 * Usage:
 *   <script src="https://keplar.one/embed.js"
 *     data-keplar-embed="emb_…"
 *     data-theme="dark|light"
 *     data-size="compact|standard|tall"
 *     data-accent="graphite|teal|earth|sky"
 *     async></script>
 * Creates an iframe pointing at /embed on the same origin as this script.
 */
(function () {
  "use strict";
  var SIZES = { compact: [360, 420], standard: [420, 560], tall: [420, 720] };
  var scripts = document.querySelectorAll("script[data-keplar-embed]");
  for (var i = 0; i < scripts.length; i++) {
    init(scripts[i]);
  }

  function init(script) {
    var id = script.getAttribute("data-keplar-embed");
    if (!id || !/^emb_[a-f0-9]{16}$/.test(id)) return;
    if (script.getAttribute("data-keplar-mounted") === "1") return;
    script.setAttribute("data-keplar-mounted", "1");

    var theme = script.getAttribute("data-theme") || "dark";
    var size = script.getAttribute("data-size") || "standard";
    var accent = script.getAttribute("data-accent") || "graphite";
    var dims = SIZES[size] || SIZES.standard;

    var srcOrigin;
    try {
      srcOrigin = new URL(script.src).origin;
    } catch (_e) {
      srcOrigin = "https://keplar.one";
    }
    var parentOrigin = location.origin;
    var url =
      srcOrigin +
      "/embed?id=" +
      encodeURIComponent(id) +
      "&theme=" +
      encodeURIComponent(theme) +
      "&accent=" +
      encodeURIComponent(accent) +
      "&size=" +
      encodeURIComponent(size) +
      "&parent=" +
      encodeURIComponent(parentOrigin);

    var iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Keplar Ask");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.src = url;
    iframe.style.cssText =
      "border:0;border-radius:12px;width:100%;max-width:" +
      dims[0] +
      "px;height:" +
      dims[1] +
      "px;display:block;background:#0b0b0d;";
    iframe.dataset.keplarEmbed = id;

    var mount = document.createElement("div");
    mount.setAttribute("data-keplar-embed-host", id);
    mount.appendChild(iframe);
    script.parentNode.insertBefore(mount, script.nextSibling);

    window.addEventListener("message", function (ev) {
      if (ev.origin !== srcOrigin) return;
      var d = ev.data;
      if (!d || d.source !== "keplar-embed" || d.id !== id) return;
      if (d.type === "resize" && typeof d.height === "number" && d.height > 200) {
        iframe.style.height = Math.min(Math.max(d.height, dims[1]), 1200) + "px";
      }
    });
  }
})();
