/* Keplar app preview error reporter (draft previews only, never published apps). Tells the builder that hosts this preview
   when the app throws, rejects a promise or gets a failed response from its own API, so the studio can offer a one-click fix.
   Sends at most 8 distinct reports per page load; never reads app data. */
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
})();
