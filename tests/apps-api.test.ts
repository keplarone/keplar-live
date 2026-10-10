import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { signIn, call, jsonReq } from "./helpers/session";
import { GET, POST } from "@/app/api/apps/route";

test("apps list: signed out is 401 JSON, not an empty 500", async () => {
  const res = await GET(call(null, "/api/apps"));
  assert.equal(res.status, 401);
  const body = await res.json() as { error?: string; code?: string };
  assert.equal(body.code, "unauthenticated");
  assert.ok(body.error);
});

test("apps list: signed in returns apps + config without playwright", async () => {
  const u = await signIn("apps-api@example.com", "plus");
  const res = await GET(call(u.cookie, "/api/apps"));
  assert.equal(res.status, 200);
  const body = await res.json() as { apps: unknown[]; config: { plan: string; styles: unknown[]; fonts: unknown[] }; meter: unknown };
  assert.ok(Array.isArray(body.apps));
  assert.equal(body.config.plan, "plus");
  assert.ok(body.config.styles.length > 0);
  assert.ok(body.config.fonts.length > 0);
  assert.ok(body.meter);

  const created = await POST(jsonReq(u.cookie, "/api/apps", "POST", { name: "Shelf app" }));
  assert.equal(created.status, 201);
  const after = await (await GET(call(u.cookie, "/api/apps"))).json() as { apps: { name: string }[] };
  assert.ok(after.apps.some((a) => a.name === "Shelf app"));
});

/** Walks static value-imports from a route; fails if playwright-core is pulled in (the production /api/apps 500). */
function staticValueImports(startRel: string): { files: string[]; playwright: string[] } {
  const root = process.cwd();
  const seen = new Set<string>();
  const playwright: string[] = [];
  const resolve = (fromFile: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c)) return c;
    return null;
  };
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const line of src.split("\n")) {
      if (!/playwright/.test(line) || /^\s*(\/\/|\*)/.test(line) || /\bimport\s+type\b/.test(line)) continue;
      if (/from\s+["']playwright(-core)?["']/.test(line) || /require\(\s*["']playwright(-core)?["']/.test(line)) {
        playwright.push(`${path.relative(root, file)}: ${line.trim()}`);
      }
    }
    const re = /(?:import|export)\s+(?:type\s+)?(?:[^"']*\s+from\s+)?["'](@\/[^"']+|\.[^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (/\bimport\s+type\b|\bexport\s+type\b/.test(m[0])) continue;
      const next = resolve(file, m[1]);
      if (next) walk(next);
    }
  };
  walk(path.join(root, startRel));
  return { files: [...seen].map((f) => path.relative(root, f)), playwright };
}

test("apps list route never statically imports playwright-core", () => {
  const { playwright, files } = staticValueImports("src/app/api/apps/route.ts");
  assert.equal(playwright.length, 0, playwright.join("\n"));
  assert.ok(!files.some((f) => f.includes("verify/smoke")), "list route must not load smoke/verify");
  assert.ok(!files.some((f) => f.includes("qa/browser")), "list route must not load qa/browser");
});
