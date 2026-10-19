import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { GET as health } from "@/app/api/health/route";

test("health: ?luau=1 is ignored without the ops secret and runs with it", async () => {
  const anon = (await (await health(new Request("https://keplar.one/api/health?luau=1"))).json()) as Record<string, unknown>;
  assert.equal("luau" in anon, false, "anonymous callers cannot trigger the analyzer");
  process.env.OPS_CHECK_SECRET = "ops-secret-0123456789abcdef";
  try {
    const authed = (await (await health(new Request("https://keplar.one/api/health?luau=1", { headers: { authorization: "Bearer ops-secret-0123456789abcdef" } }))).json()) as Record<string, unknown>;
    assert.equal("luau" in authed, true);
  } finally {
    delete process.env.OPS_CHECK_SECRET;
  }
});

test("admin: the layout gates every page server-side, and every page and admin API still checks on its own", () => {
  const layout = readFileSync("src/app/admin/layout.tsx", "utf8");
  assert.match(layout, /adminFromHeaders/);
  assert.match(layout, /notFound\(\)/);
  const walk = (d: string, out: string[] = []) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  for (const f of walk("src/app/admin").filter((p) => p.endsWith("page.tsx"))) assert.match(readFileSync(f, "utf8"), /adminFromHeaders/, `${f} checks the admin`);
  for (const f of walk("src/app/api/admin").filter((p) => p.endsWith("route.ts"))) assert.match(readFileSync(f, "utf8"), /requireAdmin|adminFromHeaders/, `${f} checks the admin`);
});

test("every new ops cron route requires the ops secret", () => {
  for (const r of ["incidents", "billing-reconcile"]) {
    const src = readFileSync(`src/app/api/cron/${r}/route.ts`, "utf8");
    assert.match(src, /opsAuthorized\(req\.headers\.get\("authorization"\)\)/);
    assert.match(src, /rateLimit\(/);
  }
});
