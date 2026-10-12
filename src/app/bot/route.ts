/** What KeplarBot is, for site owners who see it in their logs (the address in its User-Agent). Plain and static. */
export const dynamic = "force-static";

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KeplarBot</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1.25rem;color:#111}h1{font-size:1.4rem}code{background:#f2f2f2;padding:.1em .3em;border-radius:4px}@media(prefers-color-scheme:dark){body{background:#0b0b0c;color:#eee}code{background:#222}}</style></head><body>
<h1>KeplarBot</h1>
<p>KeplarBot is the visitor you see in your logs as <code>KeplarBot/1.0 (+https://keplar.one/bot)</code>. It is not a crawler. It opens <strong>one product page</strong>, and the product photos on it, only when a signed-in Keplar user pastes that page's link into the Keplar website builder to build a page about that product.</p>
<ul>
<li>It reads your <code>robots.txt</code> first and obeys it (rules for <code>KeplarBot</code>, otherwise <code>*</code>). If robots.txt can't be read, it does not fetch the page.</li>
<li>Pages that say <code>noai</code> in a robots meta tag or an <code>X-Robots-Tag</code> header are not used; <code>noimageai</code> keeps their images out.</li>
<li>It sends no cookies or credentials, follows at most a few redirects, reads at most about 1.8 MB, and makes a handful of requests per import.</li>
<li>Users are told to import only images they have the rights to.</li>
</ul>
<p>To stop it, disallow <code>KeplarBot</code> in robots.txt: <code>User-agent: KeplarBot</code> then <code>Disallow: /</code>. Questions or removal requests: <a href="mailto:team@keplar.one">team@keplar.one</a>.</p>
</body></html>`;

export function GET() {
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
