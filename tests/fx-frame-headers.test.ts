/**
 * Draft previews of generated apps rendered blank: the app document is sandboxed to an opaque origin, so its
 * <script src="/fx/kapp.N.js"> is a cross-origin load, and the app-wide `Cross-Origin-Resource-Policy: same-origin` blocked it.
 * These tests resolve next.config.ts headers the way Next does (path-to-regexp source + host condition; for the same key the
 * later rule wins) and pin both halves: /fx is loadable from the sandboxed preview, and framing stays limited to Keplar's own
 * origins while the rest of the app keeps its strict, never-framed policy.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../next.config";
import { APP_HEADERS, FX_HEADERS, KEPLAR_FRAME_ANCESTORS } from "@/lib/security/headers";
import { appCsp } from "@/lib/app-builder/files";
import { KAPP_SDK_PATH, KAPP_UI_PATH } from "@/lib/app-builder/runtime-paths";

type Rule = { source: string; has?: { type: string; value?: string }[]; headers: { key: string; value: string }[] };

async function headersFor(pathname: string, host = "keplar.one"): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers!()) as Rule[];
  const out: Record<string, string> = {};
  for (const r of rules) {
    if (getPathMatch(r.source)(pathname) === false) continue;
    const hostRule = r.has?.find((h) => h.type === "host");
    if (hostRule && !new RegExp(`^(?:${hostRule.value})$`).test(host)) continue;
    for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

const frameAncestors = (csp: string) => /(?:^|;\s*)frame-ancestors ([^;]*)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? [];

test("/fx runtime scripts load from a sandboxed (opaque-origin) draft preview: CORP cross-origin, not same-origin", async () => {
  for (const p of [KAPP_SDK_PATH, KAPP_UI_PATH, "/fx/kfx.1.js"]) {
    for (const host of ["keplar.one", "www.keplar.one", "keplar-git-x.vercel.app", "localhost"]) {
      const h = await headersFor(p, host);
      assert.equal(h["cross-origin-resource-policy"], "cross-origin", `${host}${p}`);
      assert.equal(h["access-control-allow-origin"], "*", `${host}${p}`);
      assert.equal(h["x-content-type-options"], "nosniff");
      assert.match(h["cache-control"], /immutable/);
    }
  }
});

test("/fx framing: only Keplar's own origins (self, keplar.one, *.keplar.one), never a third party, never wide open", async () => {
  const h = await headersFor(KAPP_SDK_PATH);
  const fa = frameAncestors(h["content-security-policy"] ?? "");
  assert.deepEqual(fa, ["'self'", "https://keplar.one", "https://*.keplar.one"]);
  assert.ok(!fa.includes("*") && !fa.some((o) => /^https?:\/\/\*$|^https?:$|^\*\./.test(o)), "no wildcard origin");
  assert.match(h["content-security-policy"], /^default-src 'none'/, "a script response needs no other CSP sources");
  assert.equal(h["x-frame-options"], "SAMEORIGIN", "legacy fallback; browsers with frame-ancestors ignore it");
  assert.equal(FX_HEADERS.find((x) => x.key === "Content-Security-Policy")!.value.includes(KEPLAR_FRAME_ANCESTORS), true);
});

test("the rest of the app keeps its strict policy: same-origin CORP, frame-ancestors 'none', X-Frame-Options DENY", async () => {
  for (const p of ["/", "/app/ask", "/app/create", "/pricing", "/fxsomething", "/api/compute"]) {
    const h = await headersFor(p);
    assert.equal(h["cross-origin-resource-policy"], "same-origin", p);
    assert.equal(h["x-frame-options"], "DENY", p);
    assert.deepEqual(frameAncestors(h["content-security-policy"] ?? ""), ["'none'"], p);
  }
  assert.ok(APP_HEADERS.some((x) => x.key === "Cross-Origin-Resource-Policy" && x.value === "same-origin"));
});

test("draft app documents may only be framed by Keplar itself; published apps not at all", () => {
  assert.deepEqual(frameAncestors(appCsp("draft")), ["'self'"]);
  assert.deepEqual(frameAncestors(appCsp("live")), ["'none'"]);
  assert.match(appCsp("draft"), /sandbox allow-scripts/);
  assert.doesNotMatch(appCsp("draft"), /allow-same-origin/, "the preview stays an opaque origin");
});

test("the build's browser test serves /fx with the production headers, so a blocking header fails the build instead of the preview", () => {
  const src = readFileSync("src/lib/app-builder/verify/smoke.ts", "utf8");
  assert.match(src, /import \{ FX_HEADERS \} from "@\/lib\/security\/headers"/);
  assert.match(src, /\.\.\.Object\.fromEntries\(FX_HEADERS\.map/);
});
