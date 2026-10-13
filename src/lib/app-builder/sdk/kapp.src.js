/*
 * Keplar app runtime client (window.keplar). Loaded as a classic script before the app's own modules.
 * Generated apps run in a sandboxed document with an opaque origin: no cookies, no Web Storage. This file gives them
 * - a working localStorage/sessionStorage (in memory, persisted for the tab through window.name),
 * - accounts (bearer token, never a cookie), data, files, AI, realtime (polling), a hash router, toasts and an auth dialog.
 * All network calls go to the app's own /_api on the same host; Keplar's keys never reach the browser.
 */
(function () {
  "use strict";
  if (window.keplar) return;
  var meta = document.querySelector('meta[name="k-app"]');
  var cfg = {};
  try { cfg = JSON.parse((meta && meta.getAttribute("content")) || "{}"); } catch (e) { cfg = {}; }
  var API = cfg.api || "./_api";
  var NS = "kapp:" + (cfg.id || "app") + ":" + (cfg.env || "live") + ":";

  /* ── storage that works in an opaque origin ── */
  function memoryStorage(bucket) {
    var data = {};
    try {
      var all = JSON.parse(window.name && window.name.indexOf("{\"__kapp\"") === 0 ? window.name : "{\"__kapp\":{}}").__kapp || {};
      data = all[bucket] || {};
    } catch (e) { data = {}; }
    function persist() {
      try {
        var all = {};
        try { all = JSON.parse(window.name && window.name.indexOf("{\"__kapp\"") === 0 ? window.name : "{\"__kapp\":{}}").__kapp || {}; } catch (e) { all = {}; }
        all[bucket] = data;
        var s = JSON.stringify({ __kapp: all });
        if (s.length < 1500000) window.name = s;
      } catch (e) { /* storage full: keep in memory */ }
    }
    return {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); persist(); },
      removeItem: function (k) { delete data[String(k)]; persist(); },
      clear: function () { data = {}; persist(); },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }
  function usable(name) {
    try { var s = window[name]; var t = "__k" + Math.random(); s.setItem(t, "1"); s.removeItem(t); return s; } catch (e) { return null; }
  }
  var local = usable("localStorage");
  if (!local) {
    local = memoryStorage("local");
    try { Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return local; } }); } catch (e) { /* keep keplar.local */ }
  }
  if (!usable("sessionStorage")) {
    var sess = memoryStorage("session");
    try { Object.defineProperty(window, "sessionStorage", { configurable: true, get: function () { return sess; } }); } catch (e) { /* ignore */ }
  }
  try { document.cookie; } catch (e) {
    try { Object.defineProperty(document, "cookie", { configurable: true, get: function () { return ""; }, set: function () {} }); } catch (e2) { /* ignore */ }
  }
  // Service workers, IndexedDB and caches are unavailable in the opaque origin and throw on access: make them read as absent.
  try { navigator.serviceWorker; } catch (e) {
    try { Object.defineProperty(Navigator.prototype, "serviceWorker", { configurable: true, get: function () { return undefined; } }); } catch (e2) { /* ignore */ }
  }
  try { window.indexedDB; } catch (e) {
    try { Object.defineProperty(window, "indexedDB", { configurable: true, get: function () { return undefined; } }); } catch (e2) { /* ignore */ }
  }

  function KeplarError(message, status, code) {
    var e = new Error(message);
    e.name = "KeplarError"; e.status = status || 0; e.code = code || "error";
    return e;
  }

  /* ── session ── */
  var TOKEN_KEY = NS + "token";
  var USER_KEY = NS + "user";
  var token = local.getItem(TOKEN_KEY) || cfg.session || null;
  var user = null;
  try { user = JSON.parse(local.getItem(USER_KEY) || "null"); } catch (e) { user = null; }
  var listeners = [];
  function setSession(t, u) {
    token = t || null; user = u || null;
    if (token) local.setItem(TOKEN_KEY, token); else local.removeItem(TOKEN_KEY);
    if (user) local.setItem(USER_KEY, JSON.stringify(user)); else local.removeItem(USER_KEY);
    listeners.slice().forEach(function (fn) { try { fn(user); } catch (e) { console.error(e); } });
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    if (token) headers.authorization = "Bearer " + token;
    var init = { method: method, headers: headers };
    if (body !== undefined && !opts.raw) { headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
    if (opts.raw) { init.body = body; if (opts.name) headers["x-file-name"] = encodeURIComponent(opts.name); }
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (ctl) init.signal = ctl.signal;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, opts.timeout || 30000);
    return fetch(API + path, init).then(function (res) {
      clearTimeout(timer);
      if (opts.stream) return res;
      return res.text().then(function (t) {
        var j = {};
        try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { error: t.slice(0, 200) }; }
        if (!res.ok) {
          if (res.status === 401 && token && path.indexOf("/auth/") !== 0) setSession(null, null);
          throw KeplarError(j.error || ("Request failed (" + res.status + ")"), res.status, j.code);
        }
        return j;
      });
    }, function (e) {
      clearTimeout(timer);
      throw KeplarError(e && e.name === "AbortError" ? "The request took too long." : "You appear to be offline.", 0, "network");
    });
  }
  function qs(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : String(v)));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /* ── auth ── */
  var auth = {
    user: function () { return user; },
    isAdmin: function () { return Boolean(user && user.role === "admin"); },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    signUp: function (o) { return request("POST", "/auth/signup", o || {}).then(function (r) { setSession(r.token, r.user); return r.user; }); },
    signIn: function (o) { return request("POST", "/auth/signin", o || {}).then(function (r) { setSession(r.token, r.user); return r.user; }); },
    sendMagicLink: function (email) { return request("POST", "/auth/magic", { email: email }); },
    signOut: function () { var p = token ? request("POST", "/auth/signout", {}).catch(function () {}) : Promise.resolve(); return p.then(function () { setSession(null, null); }); },
    refresh: function () {
      if (!token) return Promise.resolve(null);
      return request("GET", "/auth/me").then(function (r) { setSession(r.user ? token : null, r.user); return r.user; }, function (e) { if (e.status === 401) setSession(null, null); return user; });
    },
    updateProfile: function (o) { return request("PATCH", "/auth/profile", o || {}).then(function (r) { setSession(token, r.user); return r.user; }); },
    getUser: function (id) { return request("GET", "/users/" + encodeURIComponent(id)).then(function (r) { return r.user; }, function (e) { if (e.status === 404) return null; throw e; }); },
    listUsers: function (o) { o = o || {}; return request("GET", "/users" + qs({ q: o.q, limit: o.limit, ids: o.ids && o.ids.join(",") })).then(function (r) { return r.users; }); },
    require: function (o) { return user ? Promise.resolve(user) : auth.ui(o); },
    ui: function (o) { return authDialog(o || {}); }
  };

  /* ── data ── */
  function collection(name) {
    var base = "/db/" + encodeURIComponent(name);
    // expand: reference fields to fill in on the server ("author" or ["author", "team"]); results on item._expand[field].
    function ex(v) { return Array.isArray(v) ? v.join(",") : v || ""; }
    var c = {
      list: function (q) { q = q || {}; return request("GET", base + qs({ where: q.where, order: q.order, limit: q.limit, cursor: q.cursor, mine: q.mine ? "1" : "", expand: ex(q.expand) })); },
      all: function (q) { return c.list(q).then(function (r) { return r.items; }); },
      get: function (id, opts) { return request("GET", base + "/" + encodeURIComponent(id) + qs({ expand: ex(opts && opts.expand) })).then(function (r) { return r.item; }, function (e) { if (e.status === 404) return null; throw e; }); },
      create: function (data) { return request("POST", base, { data: data }).then(function (r) { notify(name); return r.item; }); },
      update: function (id, data) { return request("PATCH", base + "/" + encodeURIComponent(id), { data: data }).then(function (r) { notify(name); return r.item; }); },
      remove: function (id) { return request("DELETE", base + "/" + encodeURIComponent(id)).then(function () { notify(name); return true; }); },
      toggle: function (match) { return request("POST", base + "/_toggle", { match: match }).then(function (r) { notify(name); return r; }); },
      count: function (q) { q = q || {}; return request("GET", base + "/_count" + qs({ where: q.where })).then(function (r) { return r.count; }); },
      counts: function (field, values, q) { q = q || {}; if (!values || !values.length) return Promise.resolve({}); return request("GET", base + "/_counts" + qs({ field: field, values: values.join(","), where: q.where })).then(function (r) { return r.counts; }); },
      watch: function (q, cb, opts) { return watch([name], function () { return c.list(q).then(function (r) { cb(r.items, r); }); }, opts); }
    };
    return c;
  }
  var localBus = [];
  function notify(name) { localBus.slice().forEach(function (fn) { fn(name); }); }
  function watch(cols, run, opts) {
    opts = opts || {};
    var every = Math.max(1500, opts.interval || 3000);
    var last = null, stopped = false, timer = null, busy = false;
    function tick(force) {
      if (stopped) return;
      if (document.hidden && !force) { schedule(); return; }
      if (busy) { schedule(); return; }
      busy = true;
      request("GET", "/changes" + qs({ cols: cols.join(",") })).then(function (r) {
        var v = JSON.stringify(r.v || {});
        if (force || v !== last) { last = v; return run(); }
      }).catch(function (e) { if (opts.onError) opts.onError(e); }).then(function () { busy = false; schedule(); });
    }
    function schedule() { clearTimeout(timer); if (!stopped) timer = setTimeout(function () { tick(false); }, every); }
    function onLocal(n) { if (cols.indexOf(n) >= 0) { clearTimeout(timer); setTimeout(function () { tick(true); }, 50); } }
    localBus.push(onLocal);
    tick(true);
    return function () { stopped = true; clearTimeout(timer); localBus = localBus.filter(function (f) { return f !== onLocal; }); };
  }

  /* ── files ── */
  var files = {
    upload: function (file, o) {
      o = o || {};
      return request("POST", "/files", file, { raw: true, name: o.name || file.name || "file", timeout: 60000 }).then(function (r) {
        var f = r.file; if (f && f.url && f.url.charAt(0) === "/") f.url = location.origin === "null" ? f.url : f.url; return f;
      });
    },
    url: function (id) { return API + "/files/" + encodeURIComponent(id); }
  };

  /* ── AI ── */
  var ai = {
    run: function (action, input, o) {
      o = o || {};
      return request("POST", "/ai/" + encodeURIComponent(action), { input: input, history: o.history, fileIds: o.fileIds }, { timeout: 90000 }).then(function (r) { return r.json !== null && r.json !== undefined ? r.json : r.text; });
    },
    stream: function (action, input, onText, o) {
      o = o || {};
      return request("POST", "/ai/" + encodeURIComponent(action) + "?stream=1", { input: input, history: o.history, fileIds: o.fileIds }, { stream: true, timeout: 120000 }).then(function (res) {
        if (!res.ok || !res.body) return res.text().then(function (t) { var j = {}; try { j = JSON.parse(t); } catch (e) { j = {}; } throw KeplarError(j.error || "The AI couldn't answer.", res.status, j.code); });
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", text = "", result = null;
        function pump() {
          return reader.read().then(function (n) {
            if (n.done) { if (result && result.error) throw KeplarError(result.error, 0, result.code); return result && result.json != null ? result.json : text; }
            buf += dec.decode(n.value, { stream: true });
            var i;
            while ((i = buf.indexOf("\n")) >= 0) {
              var line = buf.slice(0, i); buf = buf.slice(i + 1);
              if (!line.trim()) continue;
              var j; try { j = JSON.parse(line); } catch (e) { continue; }
              if (j.d) { text += j.d; if (onText) onText(text, j.d); }
              if (j.done || j.error) result = j;
            }
            return pump();
          });
        }
        return pump();
      });
    }
  };

  /* ── router (hash based: #/path/123?x=1) ── */
  function parse() {
    var h = location.hash.replace(/^#/, "");
    if (h.indexOf("k-magic=") === 0) h = "";
    var qi = h.indexOf("?");
    var path = (qi >= 0 ? h.slice(0, qi) : h) || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    var query = {};
    if (qi >= 0) h.slice(qi + 1).split("&").forEach(function (p) { if (!p) return; var kv = p.split("="); query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); });
    return { path: path, query: query, params: {} };
  }
  var router = {
    current: parse,
    go: function (path) { if (path.charAt(0) !== "/") path = "/" + path; if (location.hash === "#" + path) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = path; },
    back: function () { history.length > 1 ? history.back() : router.go("/"); },
    match: function (pattern, path) {
      var a = pattern.split("/").filter(Boolean), b = path.split("/").filter(Boolean);
      if (a.length !== b.length) return null;
      var params = {};
      for (var i = 0; i < a.length; i++) {
        if (a[i].charAt(0) === ":") params[a[i].slice(1)] = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) return null;
      }
      return params;
    },
    resolve: function (patterns, path) {
      path = path || parse().path;
      for (var i = 0; i < patterns.length; i++) { var p = router.match(patterns[i], path); if (p) return { pattern: patterns[i], params: p }; }
      return null;
    },
    on: function (fn) {
      function h() { var r = parse(); try { fn(r); } catch (e) { console.error(e); } }
      window.addEventListener("hashchange", h);
      h();
      return function () { window.removeEventListener("hashchange", h); };
    }
  };

  /* In-page links ("#/notes", "#roasts") stay in the page. The served page has a <base> (so relative files resolve with or without a
     trailing slash), and a <base> would otherwise turn "#x" into a full load of the base URL. */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    e.preventDefault();
    if (href === "#" || href === "#top") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (href.charAt(1) === "/") { router.go(href.slice(1)); return; }
    var id = decodeURIComponent(href.slice(1));
    var el = document.getElementById(id) || document.getElementsByName(id)[0];
    if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); try { history.replaceState(null, "", location.pathname + location.search + href); } catch (_) { /* opaque origin: the hash just isn't kept */ } }
  });

  /* ── UI helpers ── */
  function toast(msg, ms) {
    var el = document.createElement("div");
    el.className = "k-toast"; el.setAttribute("role", "status"); el.textContent = String(msg);
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 2600);
  }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }
  function authDialog(o) {
    return new Promise(function (resolve) {
      var mode = o.mode === "signup" ? "signup" : "signin";
      var magic = cfg.authMethods && cfg.authMethods.indexOf("magic") >= 0;
      var back = h("div", { style: "position:fixed;inset:0;background:color-mix(in srgb,var(--ink,#000) 45%,transparent);display:grid;place-items:center;z-index:9999;padding:16px" });
      var box = h("div", { class: "k-panel", role: "dialog", "aria-modal": "true", "aria-label": "Account", style: "width:min(420px,100%);padding:28px;display:grid;gap:14px;background:var(--surface,#fff);color:var(--ink,#111)" });
      back.appendChild(box);
      function close(v) { back.remove(); document.removeEventListener("keydown", onKey); resolve(v || null); }
      function onKey(e) { if (e.key === "Escape") close(null); }
      document.addEventListener("keydown", onKey);
      back.addEventListener("click", function (e) { if (e.target === back) close(null); });
      function draw() {
        box.innerHTML = "";
        var title = h("h2", { text: mode === "signup" ? "Create your account" : "Sign in", style: "font-size:var(--t-2,1.6rem)" });
        var sub = h("p", { class: "k-muted", text: o.reason || (cfg.name ? (mode === "signup" ? "Join " : "Welcome back to ") + cfg.name + "." : "") });
        var err = h("p", { role: "alert", style: "color:var(--accent-text,#b00);min-height:1.2em;font-size:var(--t--1,.85rem)" });
        var form = h("form", { style: "display:grid;gap:10px" });
        var name = h("input", { class: "k-input", name: "name", placeholder: "Your name", autocomplete: "name", "aria-label": "Your name" });
        var email = h("input", { class: "k-input", name: "email", type: "email", required: "", placeholder: "Email", autocomplete: "email", "aria-label": "Email" });
        var pw = h("input", { class: "k-input", name: "password", type: "password", required: "", minlength: "8", placeholder: "Password (8+ characters)", autocomplete: mode === "signup" ? "new-password" : "current-password", "aria-label": "Password" });
        var go = h("button", { class: "k-btn k-btn--accent", type: "submit", text: mode === "signup" ? "Create account" : "Sign in" });
        if (mode === "signup") form.appendChild(name);
        form.appendChild(email); form.appendChild(pw); form.appendChild(go);
        form.addEventListener("submit", function (e) {
          e.preventDefault(); go.disabled = true; err.textContent = "";
          var p = mode === "signup" ? auth.signUp({ email: email.value, password: pw.value, name: name.value }) : auth.signIn({ email: email.value, password: pw.value });
          p.then(function (u) { close(u); }, function (x) { err.textContent = x.message; go.disabled = false; });
        });
        var sw = h("button", { class: "k-btn k-btn--ghost", type: "button", text: mode === "signup" ? "I already have an account" : "Create an account" });
        sw.addEventListener("click", function () { mode = mode === "signup" ? "signin" : "signup"; draw(); });
        box.appendChild(title); if (sub.textContent) box.appendChild(sub); box.appendChild(form); box.appendChild(err); box.appendChild(sw);
        if (magic) {
          var ml = h("button", { class: "k-btn k-btn--ghost", type: "button", text: "Email me a sign-in link" });
          ml.addEventListener("click", function () {
            if (!email.value) { err.textContent = "Enter your email first."; email.focus(); return; }
            auth.sendMagicLink(email.value).then(function (r) { err.textContent = r.link ? "Preview: open the link below to sign in." : r.sent ? "Check your email for the link." : "Email isn't set up for this app yet."; if (r.link) { var a = h("a", { href: r.link, text: "Open sign-in link", class: "k-btn" }); box.appendChild(a); } }, function (x) { err.textContent = x.message; });
          });
          box.appendChild(ml);
        }
        setTimeout(function () { (mode === "signup" ? name : email).focus(); }, 30);
      }
      draw();
      document.body.appendChild(back);
    });
  }

  var ready = (function () {
    var m = /(?:^#|&)k-magic=(kml_[\w-]+)/.exec(location.hash);
    var p = Promise.resolve();
    if (m) {
      p = request("POST", "/auth/magic/verify", { token: m[1] }).then(function (r) { setSession(r.token, r.user); }, function (e) { toast(e.message, 4000); });
      try { history.replaceState(null, "", location.pathname + location.search + "#/"); } catch (e) { location.hash = "/"; }
    }
    return p.then(function () { return cfg.auth && token ? auth.refresh() : user; }).then(function () { return api; }, function () { return api; });
  })();

  var api = {
    app: { id: cfg.id, name: cfg.name, env: cfg.env, api: API },
    ready: ready,
    auth: auth,
    db: { collection: collection, watch: function (cols, fn, o) { return watch(cols, function () { return Promise.resolve(fn()); }, o); } },
    files: files,
    ai: ai,
    router: router,
    local: {
      get: function (k, d) { var v = local.getItem(NS + k); if (v === null) return d === undefined ? null : d; try { return JSON.parse(v); } catch (e) { return v; } },
      set: function (k, v) { local.setItem(NS + k, JSON.stringify(v)); },
      remove: function (k) { local.removeItem(NS + k); }
    },
    image: function (slot) { return (cfg.images && cfg.images[slot]) || null; },
    toast: toast,
    KeplarError: KeplarError
  };
  window.keplar = api;
})();
