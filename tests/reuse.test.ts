import "./setup";
import { signIn } from "./helpers/session"; // before any route module (sign-in setup)
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { setNetworkForTests } from "../src/lib/mcp/ssrf";
import { flushReuseCounts, invalidate, resetReuse, REUSE, reuse, reuseDays, reuseScope, reuseStats, type ReusePolicy } from "@/lib/reuse/cache";
import { POST as linkPOST } from "@/app/api/keplar/link/route";

afterEach(() => { setNetworkForTests(); resetReuse(); });
const P: ReusePolicy = { ns: "test", version: 1, ttlMs: 60_000, maxValueBytes: 1000 };

test("exact reuse: same person + same input hits; another person, another input or a new version misses", async () => {
  let runs = 0;
  const compute = async () => ({ text: `run ${++runs}` });
  assert.deepEqual(await reuse(P, "ws:a:u:1", "same input", compute), { value: { text: "run 1" }, hit: false });
  assert.deepEqual(await reuse(P, "ws:a:u:1", "same input", compute), { value: { text: "run 1" }, hit: true });
  assert.equal((await reuse(P, "ws:a:u:2", "same input", compute)).hit, false, "never shared across people");
  assert.equal((await reuse(P, "ws:a:u:1", "same input!", compute)).hit, false, "exact only: a one-character change is a miss");
  assert.equal((await reuse({ ...P, version: 2 }, "ws:a:u:1", "same input", compute)).hit, false, "a new version invalidates everything before it");
  assert.equal(runs, 4);
});

test("expiry, errors, skip, size cap, invalidation", async () => {
  let t = 1_000;
  const now = () => t;
  let runs = 0;
  await reuse(P, "s", "x", async () => ++runs, { now });
  t += P.ttlMs + 1;
  assert.equal((await reuse(P, "s", "x", async () => ++runs, { now })).hit, false, "expired");
  await assert.rejects(reuse(P, "s", "boom", async () => { throw new Error("provider down"); }));
  assert.equal((await reuse(P, "s", "boom", async () => "fine now")).hit, false, "an error is never cached");
  assert.equal((await reuse(P, "s", "secret", async () => "x", { skip: true })).hit, false);
  assert.equal((await reuse(P, "s", "secret", async () => "x", { skip: true })).hit, false, "skip keeps nothing");
  assert.equal((await reuse(P, null, "x", async () => "x")).hit, false, "no scope, no reuse");
  await reuse(P, "s", "big", async () => "y".repeat(5000));
  assert.equal((await reuse(P, "s", "big", async () => "z")).hit, false, "too large to keep");
  await reuse(P, "s", "inv", async () => 1);
  assert.equal(invalidate(P, "s", "inv"), true);
  assert.equal((await reuse(P, "s", "inv", async () => 2)).value, 2);
  const st = reuseStats().namespaces.test;
  assert.ok(st.skip >= 3 && st.tooLarge >= 1 && st.hit === 0);
});

test("single-flight: identical work already running is shared, not started twice", async () => {
  let runs = 0;
  const slow = () => new Promise<string>((r) => { runs++; setTimeout(() => r("done"), 40); });
  const [a, b, c] = await Promise.all([reuse(P, "s", "q", slow), reuse(P, "s", "q", slow), reuse(P, "s", "q", slow)]);
  assert.equal(runs, 1);
  assert.deepEqual([a.value, b.value, c.value], ["done", "done", "done"]);
  assert.equal(reuseStats().namespaces.test.shared, 2);
});

test("scope: signed in = workspace + person; signed out = signed device cookie, else the IP", () => {
  assert.equal(reuseScope({ id: "w", anonymous: false, userId: "u" }, {}), "ws:w:u:u");
  assert.equal(reuseScope({ id: "anonymous", anonymous: true }, { deviceId: "d1", ip: "1.2.3.4" }), "dev:d1");
  assert.equal(reuseScope({ id: "anonymous", anonymous: true }, { ip: "1.2.3.4" }), "ip:1.2.3.4");
});

test("counts reach the daily table for /admin (counts only, no keys or values)", async () => {
  await reuse(P, "s", "a", async () => 1);
  await reuse(P, "s", "a", async () => 1);
  await flushReuseCounts();
  const rows = await reuseDays(1);
  const t = rows.find((r) => r.ns === "test")!;
  assert.ok(t.hit >= 1 && t.miss >= 1);
  assert.ok(t.hitRate !== null && t.hitRate > 0);
  assert.ok(!JSON.stringify(rows).includes("ws:"), "no scope or key stored");
});

test("route: the same person reading the same link twice fetches once; another person fetches their own; failures are not kept", async () => {
  const hits: string[] = [];
  const body = `<!doctype html><html><head><title>Owls</title></head><body><main><article><h1>Owls</h1><p>${"Owls hunt at night and use their hearing to find prey in the dark. ".repeat(12)}</p></article></main></body></html>`;
  setNetworkForTests({
    resolver: async () => ["93.184.216.34"],
    transport: async (r) => {
      hits.push(r.url.toString());
      if (r.url.pathname === "/missing") return { status: 404, headers: {} as Record<string, string>, body: Buffer.from("") };
      return { status: 200, headers: { "content-type": "text/html; charset=utf-8" } as Record<string, string>, body: Buffer.from(body) };
    },
  });
  const a = await signIn(`reuse-a-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const b = await signIn(`reuse-b-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const read = (cookie: string, url: string) => linkPOST(new Request("https://keplar.one/api/keplar/link", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", cookie, "x-forwarded-for": "10.55.1.1" }, body: JSON.stringify({ url }) }));
  const r1 = await read(a.cookie, "https://birds.example.com/owls");
  assert.equal(r1.status, 200);
  const first = await r1.json();
  const r2 = await read(a.cookie, "https://birds.example.com/owls");
  assert.deepEqual(await r2.json(), first, "the same result");
  assert.equal(hits.filter((h) => h.endsWith("/owls")).length, 1, "fetched once for the same person");
  await (await read(b.cookie, "https://birds.example.com/owls")).json();
  assert.equal(hits.filter((h) => h.endsWith("/owls")).length, 2, "another person gets their own read");
  assert.notEqual((await read(a.cookie, "https://birds.example.com/missing")).status, 200);
  assert.notEqual((await read(a.cookie, "https://birds.example.com/missing")).status, 200);
  assert.equal(hits.filter((h) => h.endsWith("/missing")).length, 2, "a failed read is tried again, never cached");
  assert.equal(REUSE.link.ns, "link");
});
