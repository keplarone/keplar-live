#!/usr/bin/env node
/**
 * Submit changed URLs to IndexNow (Bing, Yandex, Naver, Seznam and others share submissions; Google does not use IndexNow).
 * Usage: node scripts/indexnow.mjs [--all] [url ...]     (default: every URL in keplar.one's four sitemaps and business.keplar.one's, with --all)
 * ChatGPT search and Copilot answer from Bing's index, so run it after each production deploy (npm run indexnow).
 * The key file must already be live at https://<host>/794a2fb6c986d2a4fdc970229ac50be4.txt on each host - the script checks that first
 * and skips a host that doesn't serve it. One submission per host (IndexNow wants every URL in a request to share the host).
 * It prints "accepted" only when the endpoint answers 200/202; anything else is reported as not submitted.
 */
const KEY = "794a2fb6c986d2a4fdc970229ac50be4";
const SITEMAPS = {
  "keplar.one": ["/sitemap.xml", "/answers-sitemap.xml", "/templates-sitemap.xml", "/topics-sitemap.xml"],
  // Keplar Business is its own host with its own sitemap (src/lib/business/seo.ts); the same public key file is served there.
  "business.keplar.one": ["/sitemap.xml"],
};

const args = process.argv.slice(2);
const given = args.filter((a) => a.startsWith("https://"));
const byHost = new Map();
const add = (u) => { const h = new URL(u).host; if (!byHost.has(h)) byHost.set(h, new Set()); byHost.get(h).add(u); };
if (args.includes("--all") || given.length === 0) {
  // Every sitemap robots.txt lists (published answers, templates and topics live in their own), de-duplicated.
  for (const [host, paths] of Object.entries(SITEMAPS)) {
    for (const path of paths) {
      const res = await fetch(`https://${host}${path}`).catch(() => null);
      if (!res?.ok) continue;
      for (const m of (await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) add(m[1].trim());
    }
  }
}
for (const u of given) add(u);

let failed = 0;
for (const [host, set] of byHost) {
  const keyUrl = `https://${host}/${KEY}.txt`;
  const urls = [...set];
  const live = await fetch(keyUrl).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (live.trim() !== KEY) {
    console.error(`NOT SUBMITTED (${host}): key file is not live at ${keyUrl} yet. Deploy first.`);
    failed++;
    continue;
  }
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: KEY, keyLocation: keyUrl, urlList: urls.slice(0, 10000) }),
  });
  const ok = res.status === 200 || res.status === 202;
  console.log(ok ? `${host}: accepted (HTTP ${res.status}) for ${urls.length} URLs` : `${host}: NOT accepted: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  if (!ok) failed++;
}
process.exit(failed ? (byHost.size === failed ? 2 : 1) : 0);
