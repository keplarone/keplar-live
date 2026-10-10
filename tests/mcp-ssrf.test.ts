import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { checkUrl, directTransport, FetchError, isPublicIp, safeFetch, setNetworkForTests, SsrfError } from "../src/lib/mcp/ssrf";

afterEach(() => setNetworkForTests());
const env = process.env as Record<string, string | undefined>;
const withEnv = async (k: string, v: string, fn: () => Promise<void> | void) => {
  const old = env[k];
  env[k] = v;
  try {
    await fn();
  } finally {
    if (old === undefined) delete env[k];
    else env[k] = old;
  }
};

test("ssrf: private, loopback, link-local, metadata, CGNAT, multicast and reserved IPv4 are refused; public ones pass", () => {
  for (const ip of ["127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255", "192.0.2.1", "198.51.100.7", "203.0.113.9", "198.18.0.1", "192.88.99.1"]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ["8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "1.1.1.1", "198.20.0.1"]) assert.equal(isPublicIp(ip), true, ip);
});

test("ssrf: IPv6 loopback, ULA, link-local, mapped/NAT64/6to4-with-private, documentation and malformed are refused; global unicast passes", () => {
  for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2001:db8::1", "2001::1", "2002:7f00:1::1", "2002:0a00:0001::1", "fec0::1", "::127.0.0.1", "not-an-ip", "2001:4860:4860::8888%eth0", "1:2:3:4:5:6:7:8:9"]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "2002:5db8:d822::1"]) assert.equal(isPublicIp(ip), true, ip);
});

test("ssrf: URL policy: https only in production, no credentials, no internal names, no odd schemes or ports", async () => {
  await withEnv("NODE_ENV", "production", () => {
    assert.throws(() => checkUrl("http://example.com/mcp"), /https/);
    assert.equal(checkUrl("https://example.com/mcp").hostname, "example.com");
  });
  assert.equal(checkUrl("http://example.com/mcp", { allowHttp: true }).protocol, "http:");
  for (const bad of [
    "https://user:pass@example.com/", "ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/plain,hi", "gopher://example.com/",
    "https://localhost/", "https://LOCALHOST./", "https://app.localhost/", "https://printer.local/", "https://metadata.google.internal/", "https://intranet/", "https://corp.internal/x",
    "https://127.0.0.1/", "https://2130706433/", "https://0x7f.1/", "https://017700000001/", "https://127.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://169.254.169.254/latest/meta-data/", "https://[fd00::1]/", "https://10.1.2.3:8443/", "https://0/",
    "https://example.com:22/", "https://example.com:25/", "", "   ", "https://", "not a url", "https://exa mple.com/",
  ]) assert.throws(() => checkUrl(bad, { allowHttp: true }), SsrfError, bad);
  assert.equal(checkUrl("https://example.com:8443/mcp").port, "8443");
});

test("ssrf: a name that resolves to a private address is refused, including when only one of several answers is private", async () => {
  setNetworkForTests({ resolver: async (h) => (h === "mixed.example.com" ? ["93.184.216.34", "10.0.0.5"] : h === "meta.example.com" ? ["169.254.169.254"] : h === "v6.example.com" ? ["::1"] : ["93.184.216.34"]), transport: async () => { throw new Error("must not connect"); } });
  for (const h of ["mixed", "meta", "v6"]) await assert.rejects(safeFetch(`https://${h}.example.com/mcp`), (e: Error) => e instanceof SsrfError && /private or internal/.test(e.message), h);
});

test("ssrf: DNS rebinding: the socket is pinned to the address that was validated, not re-resolved", async () => {
  let lookups = 0;
  const seen: string[] = [];
  setNetworkForTests({
    resolver: async () => (++lookups === 1 ? ["93.184.216.34"] : ["127.0.0.1"]), // the second answer would be the rebind
    transport: async (r) => {
      seen.push(r.ip);
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    },
  });
  await safeFetch("https://rebind.example.com/mcp");
  assert.deepEqual(seen, ["93.184.216.34"]);
  assert.equal(lookups, 1, "one resolution per hop; the connection never resolves the name again");
  // And the real transport, given a pinned IP, never asks DNS for the name at all (the name below does not exist).
  const srv = http.createServer((req, res) => res.end(`host=${req.headers.host}`));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  try {
    const res = await directTransport({ url: new URL(`http://pinned.invalid:${port}/x`), ip: "127.0.0.1", method: "GET", headers: {}, timeoutMs: 2000, maxBytes: 1000 });
    assert.equal(res.body.toString(), `host=pinned.invalid:${port}`);
  } finally {
    srv.close();
  }
});

test("ssrf: redirects are re-validated: to a private literal, to a name that resolves privately, to http in production; credentials are dropped cross-origin", async () => {
  const hops: { url: string; auth?: string }[] = [];
  const redirectTo = (loc: string, status = 302): NonNullable<Parameters<typeof setNetworkForTests>[0]> => ({
    resolver: async (h) => (h === "internal.example.com" ? ["10.0.0.9"] : ["93.184.216.34"]),
    transport: async (r) => {
      hops.push({ url: r.url.toString(), auth: r.headers.authorization });
      return r.url.hostname === "start.example.com" ? { status, headers: { location: loc } as Record<string, string>, body: Buffer.alloc(0) } : { status: 200, headers: {} as Record<string, string>, body: Buffer.from("ok") };
    },
  });
  for (const loc of ["http://169.254.169.254/latest/meta-data/", "https://127.0.0.1/", "https://[::1]/", "https://internal.example.com/x", "https://localhost/x", "file:///etc/passwd"]) {
    setNetworkForTests(redirectTo(loc));
    await assert.rejects(safeFetch("https://start.example.com/", { allowHttp: true }), SsrfError, loc);
  }
  await withEnv("NODE_ENV", "production", async () => {
    setNetworkForTests(redirectTo("http://other.example.com/"));
    await assert.rejects(safeFetch("https://start.example.com/"), SsrfError);
  });
  hops.length = 0;
  setNetworkForTests(redirectTo("https://other.example.org/x"));
  const ok = await safeFetch("https://start.example.com/", { headers: { authorization: "Bearer SECRET" }, secretHeaders: ["authorization"] });
  assert.equal(ok.status, 200);
  assert.equal(hops[0].auth, "Bearer SECRET");
  assert.equal(hops[1].auth, undefined, "credential is not forwarded to another origin");
  // Same-origin redirect keeps it.
  hops.length = 0;
  setNetworkForTests({ resolver: async () => ["93.184.216.34"], transport: async (r) => { hops.push({ url: r.url.toString(), auth: r.headers.authorization }); return r.url.pathname === "/a" ? { status: 307, headers: { location: "/b" } as Record<string, string>, body: Buffer.alloc(0) } : { status: 200, headers: {} as Record<string, string>, body: Buffer.from("ok") }; } });
  await safeFetch("https://same.example.com/a", { method: "POST", body: "{}", headers: { authorization: "Bearer S" }, secretHeaders: ["authorization"] });
  assert.equal(hops[1].auth, "Bearer S");
});

test("ssrf: redirect loops are bounded and a POST is never silently turned into a GET", async () => {
  setNetworkForTests({ resolver: async () => ["93.184.216.34"], transport: async () => ({ status: 307, headers: { location: "/again" }, body: Buffer.alloc(0) }) });
  await assert.rejects(safeFetch("https://loop.example.com/"), (e: Error) => e instanceof FetchError && e.kind === "redirect");
  setNetworkForTests({ resolver: async () => ["93.184.216.34"], transport: async () => ({ status: 302, headers: { location: "/x" }, body: Buffer.alloc(0) }) });
  await assert.rejects(safeFetch("https://post.example.com/", { method: "POST", body: "{}" }), (e: Error) => e instanceof FetchError && e.kind === "redirect");
});

test("ssrf: real sockets: response size is capped, slow servers time out, and loopback is unreachable through safeFetch", async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === "/big") {
      res.writeHead(200);
      const chunk = Buffer.alloc(64 * 1024, 97);
      let n = 0;
      const t = setInterval(() => { res.write(chunk); if (++n > 200) { clearInterval(t); res.end(); } }, 1);
      res.on("close", () => clearInterval(t));
    } else if (req.url === "/slow") setTimeout(() => res.end("late"), 2000).unref();
    else res.end("fine");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://pin.invalid:${(srv.address() as AddressInfo).port}`;
  try {
    const t0 = Date.now();
    await assert.rejects(directTransport({ url: new URL(`${base}/big`), ip: "127.0.0.1", method: "GET", headers: {}, timeoutMs: 5000, maxBytes: 100_000 }), (e: Error) => e instanceof FetchError && e.kind === "too_large");
    assert.ok(Date.now() - t0 < 3000, "cut off early, not after the whole body");
    await assert.rejects(directTransport({ url: new URL(`${base}/slow`), ip: "127.0.0.1", method: "GET", headers: {}, timeoutMs: 150, maxBytes: 1000 }), (e: Error) => e instanceof FetchError && e.kind === "timeout");
    // The real resolver + real network path: a loopback server is not reachable through the guard.
    await assert.rejects(safeFetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/`, { allowHttp: true }), SsrfError);
    await assert.rejects(safeFetch(`http://localhost:${(srv.address() as AddressInfo).port}/`, { allowHttp: true }), SsrfError);
  } finally {
    srv.close();
  }
});
