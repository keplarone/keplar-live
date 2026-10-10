#!/usr/bin/env node
/**
 * Submit changed URLs to IndexNow (Bing, Yandex, Naver, Seznam and others share submissions; Google does not use IndexNow).
 * Usage: node scripts/indexnow.mjs [--all] [url ...]     (default: every URL in https://keplar.one/sitemap.xml with --all)
 * The key file must already be live at https://keplar.one/794a2fb6c986d2a4fdc970229ac50be4.txt - the script checks that first and refuses to submit otherwise.
 * It prints "accepted" only when the endpoint answers 200/202; anything else is reported as not submitted.
 */
const HOST = "keplar.one";
const KEY = "794a2fb6c986d2a4fdc970229ac50be4";
const KEY_URL = `https://${HOST}/${KEY}.txt`;

const args = process.argv.slice(2);
let urls = args.filter((a) => a.startsWith("https://"));
if (args.includes("--all") || urls.length === 0) {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
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
