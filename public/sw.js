/* Keplar static asset service worker. Caches only hashed /_next/static, /icons, /fonts, /fx.
   Never caches HTML, /api, or anything with Set-Cookie. Does not intercept navigations. */
const CACHE = "keplar-static-v1";
const ALLOW = [/^\/_next\/static\//, /^\/icons\//, /^\/fonts\//, /^\/fx\//];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE)); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (!ALLOW.some((re) => re.test(u.pathname))) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      // Revalidate in the background so a deploy's new hashes replace stale copies without blocking paint.
      fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});
