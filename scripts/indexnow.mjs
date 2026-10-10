#!/usr/bin/env node
/**
 * Submit changed URLs to IndexNow (Bing, Yandex, Naver, Seznam and others share submissions; Google does not use IndexNow).
 * Usage: node scripts/indexnow.mjs [--all] [url ...]     (default: every URL in keplar.one's four sitemaps with --all)
 * ChatGPT search and Copilot answer from Bing's index, so run it after each production deploy (npm run indexnow).
 * The key file must already be live at https://keplar.one/794a2fb6c986d2a4fdc970229ac50be4.txt - the script checks that first and refuses to submit otherwise.
 * It prints "accepted" only when the endpoint answers 200/202; anything else is reported as not submitted.
 */
const HOST = "keplar.one";
const KEY = "794a2fb6c986d2a4fdc970229ac50be4";
const KEY_URL = `https://${HOST}/${KEY}.txt`;

const args = process.argv.slice(2);
let urls = args.filter((a) => a.startsWith("https://"));
if (args.includes("--all") || urls.length === 0) {
  // Every sitemap robots.txt lists (published answers, templates and topics live in their own), de-duplicated.
  const all = new Set();
  for (const path of ["/sitemap.xml", "/answers-sitemap.xml", "/templates-sitemap.xml", "/topics-sitemap.xml"]) {
    const res = await fetch(`https://${HOST}${path}`).catch(() => null);
    if (!res?.ok) continue;
    for (const m of (await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) all.add(m[1].trim());
  }
  urls = [...all];
}
const live = await fetch(KEY_URL).then((r) => (r.ok ? r.text() : "")).catch(() => "");
if (live.trim() !== KEY) {
  console.error(`NOT SUBMITTED: key file is not live at ${KEY_URL} yet. Deploy first.`);
  process.exit(2);
}
const res = await fetch("https://api.indexnow.org/IndexNow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_URL, urlList: urls.slice(0, 10000) }),
});
const ok = res.status === 200 || res.status === 202;
console.log(ok ? `accepted (HTTP ${res.status}) for ${urls.length} URLs` : `NOT accepted: HTTP ${res.status} ${await res.text().catch(() => "")}`);
process.exit(ok ? 0 : 1);
