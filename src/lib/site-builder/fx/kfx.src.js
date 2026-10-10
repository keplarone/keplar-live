/* Keplar site effects loader. Plain ES5-compatible script, ~3 KB minified. Config comes from the script tag:
   data-i=<0..100 intensity> data-e=<default effect> data-gl=<url of the three.js module>.
   Does: scroll reveals, light parallax, and lazy-starts hero scenes. Never touches layout: only opacity/transform and an
   absolutely positioned canvas. Honors prefers-reduced-motion, Save-Data, small/coarse devices and low-end hardware. */
(function () {
  if (window.__kfx) return;
  window.__kfx = 1;
  var d = document, s = d.currentScript;
  if (!s) return;
  var I = Math.max(0, Math.min(100, +s.getAttribute("data-i") || 0));
  var E0 = s.getAttribute("data-e") || "particles";
  var GL = s.getAttribute("data-gl");
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduce = mq("(prefers-reduced-motion: reduce)");
  var conn = navigator.connection || {};
  var saveData = !!conn.saveData;
  var small = mq("(max-width: 760px)") || mq("(pointer: coarse)");
  var weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  if (I === 0) return;

  var css = d.createElement("style");
  css.textContent =
    ".kfx-pre{opacity:0;transform:translate3d(0,18px,0)}.kfx-pre[data-reveal=fade]{transform:none}" +
    ".kfx-pre[data-reveal=mask]{opacity:1;transform:none;clip-path:inset(0 0 100% 0)}" +
    ".kfx-in{opacity:1;transform:none;clip-path:inset(0 0 0 0);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1),clip-path 1s cubic-bezier(.2,.7,.2,1)}";
  d.head.appendChild(css);

  /* reveals: only elements below the first screen are hidden, so nothing flashes at load */
  function reveals() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var els = d.querySelectorAll("[data-reveal]");
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, dl = +el.getAttribute("data-reveal-delay") || 0;
        io.unobserve(el);
        setTimeout(function () { el.classList.add("kfx-in"); el.classList.remove("kfx-pre"); }, dl);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.top < vh * 0.92) continue;
      els[i].classList.add("kfx-pre");
      io.observe(els[i]);
    }
    setTimeout(function () { var p = d.querySelectorAll(".kfx-pre"); for (var j = 0; j < p.length; j++) { p[j].classList.add("kfx-in"); p[j].classList.remove("kfx-pre"); } }, 6000);
  }

  /* parallax: transform only, near-viewport elements, off on phones */
  function parallax() {
    if (reduce || small || I < 30) return;
    var els = [].slice.call(d.querySelectorAll("[data-parallax]"));
    if (!els.length) return;
    var tick = false;
    function run() {
      tick = false;
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        var k = (parseFloat(el.getAttribute("data-parallax")) || 0) * (I / 100);
        var off = ((r.top + r.height / 2) - vh / 2) / vh;
        el.style.transform = "translate3d(0," + (-off * k).toFixed(1) + "px,0)";
      });
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(run); } }, { passive: true });
    run();
  }

  /* scenes */
  var loading = null, active = 0, MAX = 2;
  function loadGL(cb) {
    if (window.__kfxGL) return cb();
    if (loading) return loading.push(cb);
    loading = [cb];
    var g = d.createElement("script");
    g.src = GL; g.async = true;
    g.onload = function () { var q = loading; loading = null; q.forEach(function (f) { f(); }); };
    g.onerror = function () { loading = null; };
    d.head.appendChild(g);
  }
  function color(cs, name, fb) { var v = cs.getPropertyValue(name).trim(); return v || fb; }
  function scenes() {
    if (saveData || weak && !reduce && I < 70) return;
    var hosts = d.querySelectorAll("[data-kfx]");
    if (!hosts.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        if (active >= MAX) return;
        var host = e.target;
        var go = function () {
          loadGL(function () {
            if (!window.__kfxGL || active >= MAX || host.__kfx) return;
            var cs = getComputedStyle(host);
            var c = d.createElement("canvas");
            c.className = "kfx-canvas"; c.setAttribute("aria-hidden", "true");
            host.insertBefore(c, host.firstChild);
            var ef = host.getAttribute("data-kfx-effect") || E0;
            var r = window.__kfxGL.mount(host, c, {
              effect: ef, shape: host.getAttribute("data-kfx-shape") || "", intensity: I, small: small, reduce: reduce,
              ink: color(cs, "--ink", "#111111"), accent: color(cs, "--accent", "#cc4422"), bg: color(cs, "--bg", "#ffffff")
            });
            if (r) { host.__kfx = r; active++; } else if (c.parentNode) c.parentNode.removeChild(c);
          });
        };
        if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
      });
    }, { rootMargin: "240px" });
    for (var i = 0; i < hosts.length; i++) io.observe(hosts[i]);
  }

  function init() { reveals(); parallax(); scenes(); }
  if (d.readyState === "complete") init(); else window.addEventListener("load", init, { once: true });
})();
