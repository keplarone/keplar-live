import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { directTransport, setNetworkForTests } from "../src/lib/mcp/ssrf";
import { readLink, LinkError } from "../src/lib/attachments/link";
import { ATTACH_LIMITS } from "../src/lib/attachments/kinds";

afterEach(() => setNetworkForTests());
const L = { ...ATTACH_LIMITS.free, linkChars: 14_000 };
type Net = NonNullable<Parameters<typeof setNetworkForTests>[0]>;
const PUBLIC = "93.184.216.34";
const page = (body: string, head = "") => `<!doctype html><html><head><title>Field guide</title>${head}</head><body><main><article><h1>Field guide</h1>${body}</article></main></body></html>`;
const LONG = "<p>" + "Owls hunt at night and use their hearing to find prey in the dark. ".repeat(12) + "</p>";

function fake(routes: Record<string, { status?: number; headers?: Record<string, string>; body?: string | Buffer }>, resolve: Record<string, string[]> = {}): { net: Net; hits: string[] } {
  const hits: string[] = [];
  return {
    hits,
    net: {
      resolver: async (h) => resolve[h] ?? [PUBLIC],
      transport: async (r) => {
        hits.push(`${r.ip} ${r.url.toString()}`);
        const hit = routes[r.url.toString()];
        if (!hit) return { status: 404, headers: {}, body: Buffer.from("") };
        return { status: hit.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...hit.headers }, body: Buffer.isBuffer(hit.body) ? hit.body : Buffer.from(hit.body ?? "") };
      },
    },
  };
}
const code = (c: LinkError["code"]) => (e: unknown) => e instanceof LinkError && e.code === c;

test("link: a public article is read Readability-style with title, site and main text", async () => {
  const f = fake({ "https://birds.example.com/owls": { body: page(LONG, '<meta property="og:site_name" content="Birds">') } });
  setNetworkForTests(f.net);
  const r = await readLink("https://birds.example.com/owls", L);
  assert.equal(r.kind, "page");
  assert.equal(r.title, "Field guide");
  assert.equal(r.siteName, "Birds");
  assert.match(r.text, /Owls hunt at night/);
  assert.match(r.text, /URL: https:\/\/birds\.example\.com\/owls/);
  assert.ok(f.hits.every((h) => h.startsWith(PUBLIC)));
});

test("link: private, loopback, metadata and internal hosts are refused before any connection", async () => {
  const f = fake({}, { "intra.example.com": ["10.1.2.3"], "meta.example.com": ["169.254.169.254"], "mixed.example.com": [PUBLIC, "192.168.0.4"] });
  setNetworkForTests(f.net);
  for (const u of ["http://127.0.0.1/", "http://localhost:3000/", "http://169.254.169.254/latest/meta-data/", "http://metadata.google.internal/", "http://[::1]/", "http://10.0.0.1/admin", "https://intra.example.com/", "https://meta.example.com/", "https://mixed.example.com/", "http://2130706433/"]) {
    await assert.rejects(readLink(u, L), (e: unknown) => e instanceof LinkError && (e.code === "private" || e.code === "invalid_url"), u);
  }
  assert.deepEqual(f.hits, [], "nothing was fetched");
  await assert.rejects(readLink("file:///etc/passwd", L), code("invalid_url"));
  await assert.rejects(readLink("javascript:alert(1)", L), code("invalid_url"));
  await assert.rejects(readLink("https://user:pw@example.com/", L), code("invalid_url"));
});

test("link: a redirect to a private address is re-validated and refused", async () => {
  const f = fake({ "https://short.example.com/x": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } } });
  setNetworkForTests(f.net);
  await assert.rejects(readLink("https://short.example.com/x", L), code("private"));
  const g = fake({ "https://short.example.com/y": { status: 301, headers: { location: "https://inside.example.com/" } } }, { "inside.example.com": ["10.9.9.9"] });
  setNetworkForTests(g.net);
  await assert.rejects(readLink("https://short.example.com/y", L), code("private"));
  assert.equal(g.hits.length, 1, "only the first, public hop was requested");
});

test("link: redirect chains are capped", async () => {
  const routes: Record<string, { status: number; headers: Record<string, string> }> = {};
  for (let i = 0; i < 8; i++) routes[`https://loop.example.com/${i}`] = { status: 302, headers: { location: `https://loop.example.com/${i + 1}` } };
  setNetworkForTests(fake(routes).net);
  await assert.rejects(readLink("https://loop.example.com/0", L), (e: unknown) => e instanceof LinkError && /redirected too many times/.test(e.message));
});

test("link: pages that opt out of AI use (X-Robots-Tag or robots meta noai) are not read", async () => {
  setNetworkForTests(fake({ "https://a.example.com/": { headers: { "x-robots-tag": "noai, noimageai" }, body: page(LONG) }, "https://b.example.com/": { body: page(LONG, '<meta name="robots" content="index, noai">') } }).net);
  await assert.rejects(readLink("https://a.example.com/", L), code("noai"));
  await assert.rejects(readLink("https://b.example.com/", L), code("noai"));
});

test("link: HTTP errors map to plain messages", async () => {
  setNetworkForTests(fake({ "https://e.example.com/403": { status: 403 }, "https://e.example.com/429": { status: 429 }, "https://e.example.com/500": { status: 503 } }).net);
  await assert.rejects(readLink("https://e.example.com/404", L), code("not_found"));
  await assert.rejects(readLink("https://e.example.com/403", L), code("denied"));
  await assert.rejects(readLink("https://e.example.com/429", L), code("rate"));
  await assert.rejects(readLink("https://e.example.com/500", L), code("server"));
});

test("link: images become a data URL only when the bytes really are an image; JSON and CSV get real stats", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  setNetworkForTests(fake({
    "https://i.example.com/a.png": { headers: { "content-type": "image/png" }, body: png },
    "https://i.example.com/fake.png": { headers: { "content-type": "image/png" }, body: "<html>not an image</html>" },
    "https://d.example.com/t.csv": { headers: { "content-type": "text/csv" }, body: "city,temp\nOslo,4\nRome,18\nCairo,30\n" },
  }).net);
  const img = await readLink("https://i.example.com/a.png", L);
  assert.equal(img.kind, "image");
  assert.match(img.dataUrl ?? "", /^data:image\/png;base64,/);
  await assert.rejects(readLink("https://i.example.com/fake.png", L), code("unsupported"));
  const csv = await readLink("https://d.example.com/t.csv", L);
  assert.equal(csv.kind, "data");
  assert.match(csv.text, /mean 17\.33/);
});

test("link: script-only shells say so instead of pretending to read them", async () => {
  setNetworkForTests(fake({ "https://spa.example.com/": { body: '<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>' } }).net);
  await assert.rejects(readLink("https://spa.example.com/", L), code("empty"));
});

test("link: the response size cap is enforced on the real socket (5 MB)", async () => {
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let sent = 0;
    const pump = () => { while (sent < 8 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return res.once("drain", pump); } res.end(); };
    pump();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  // DNS says public; the pinned socket is pointed at the local test server so the real transport's byte cap is exercised.
  setNetworkForTests({ resolver: async () => [PUBLIC], transport: (r) => directTransport({ ...r, ip: "127.0.0.1" }) });
  try {
    await assert.rejects(readLink(`http://big.example.com:${port}/`, L), code("too_large"));
  } finally {
    srv.close();
  }
});
