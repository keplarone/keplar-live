import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { signIn, call, jsonReq } from "./helpers/session";
import { projects, domains, mediaJobs } from "@/lib/create/repo";
import { agents, approvals, deals, contacts } from "@/lib/business/repo";
import { blobs } from "@/lib/create/platform/blob";
import { newNonce, nonceHash } from "@/lib/business/handoff";

/**
 * Authorization regression guard.
 *  1. Every API route handler refuses an anonymous caller unless it is in the reviewed public list below.
 *     A NEW route that answers an anonymous request with 2xx fails this test until someone reviews it.
 *  2. Cross-user: user B cannot read, change or delete user A's rows through the routes that had no isolation test.
 *  3. Admin surfaces are 404 for signed-in non-admins.
 */

const root = path.resolve("src/app/api");
const routeFiles: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "route.ts") routeFiles.push(p);
  }
})(root);

/** Routes with their own non-session protection (signature, token, public-by-design). Reviewed one by one. */
const OWN_PROTECTION = /^(auth|inngest|webhooks|health|inquire|business\/stripe\/webhook)/;
/** Method + route that may answer an anonymous caller with 2xx/4xx-validation on purpose. */
const PUBLIC_OK = new Set(["GET compute", "GET v1/openapi.json" /* public API description */, "GET faq" /* the home "most frequently asked" list: pinned question, counts of questions >= 5 opted-in people asked, generic starters; no personal data */, "GET account/accounts" /* signed out: an empty list, no tokens */, "POST account/accounts" /* same-origin only; with nothing to act on it answers 200/400 and changes nothing */, "GET create/abuse", "POST create/abuse", "POST keplar", "POST keplar/link" /* signed-out Ask can share a link: same-origin, SSRF-safe reader (public hosts only), 20/min per IP + daily cap, returns only what the public page says */, "POST keplar/transcribe" /* signed-out Ask can attach audio/video: same-origin, WAV-only body capped at 2.3 MB, rate + daily caps, Free/anonymous use free models only, nothing stored */, "POST presence" /* cookie-free heartbeat: same-origin, 16-byte body, anonymous daily code only, always 204 */, "POST growth/event" /* consent-gated, allow-listed, always 204 */, "POST account/secure" /* emailed signed link is the credential; it can only sign sessions OUT, never in */, "POST report" /* "Report this answer": same-origin, honeypot, 10/hour per IP, stored for admin review only */, "POST support" /* contact form: same-origin, honeypot, rate-limited, stored as a ticket, nothing auto-sent */, "POST client-error" /* browser error beacon: same-origin, budgeted, scrubbed, stored for admin only */, "POST feedback" /* public feedback form: same-origin, honeypot, rate-limited */, "POST learning/signal" /* thumbs / copy on an answer: same-origin, rate-limited, only bumps content-free tallies of a turn the caller's own session produced */, "POST core/signal" /* outcome signals (confused / edit / complete) for Keplar Core: same-origin, 120/h per IP, content-free, honors the opt-out; 400 before anything is stored */, "POST embed/ask" /* the public Ask widget: the widget id is the credential (revocable), origin allowlist, per-widget minute/day and per-IP limits (src/lib/embed/store.ts), metered to the publisher; 400 for a malformed id */, "GET templates/[slug]/like" /* signed out: { liked: false }, reveals nothing; liking (POST) needs an account */, "POST seo/event" /* consent-gated, allow-listed, always 204 */, "POST business/checkout", "POST business/forms/[projectId]", "GET mcp/oauth/callback" /* redirects anonymous visitors to sign-in; reveals nothing */, "POST billing/checkout" /* 503 "opens soon" when unconfigured; 401 once configured */, "POST billing/apple/verify" /* 503 until APPLE_BUNDLE_ID; then 401 for anonymous */]);

PUBLIC_OK.add("GET business/account"); // Storefront status: signed-out callers get only { signedIn: false }.
PUBLIC_OK.add("GET business/handoff"); // Redirects to sign-in; a ticket requires an authenticated session.
PUBLIC_OK.add("GET studio/modes"); // Solar mode table: budgets, prices and the provider disclosure; no account data, read-only.
PUBLIC_OK.add("GET sky"); // The weather sky behind the marketing pages: public, read-only, cheap ({ sky, wind } only; the rounded location is used once for a cached Open-Meteo lookup and never stored or returned).
// The browser extension connecting to an account (src/lib/api/extension.ts): starting only creates a sign-in request (400 for a bad
// PKCE challenge, 20 per 10 minutes per IP); the poll answers {status} and hands a key only to the verifier holder after the person approved.
PUBLIC_OK.add("POST extension/connect");
PUBLIC_OK.add("POST extension/token");
// Space Studio (src/lib/space-studio): the account summary answers signed-out callers with { signedIn: false }, Free defaults and the
// public model list (no account data); the billing webhook's HMAC signature is its credential (503 until its secret is set, 401 for a bad
// signature); the Roblox link callback always redirects back to the app and changes nothing without the signed-in account's sealed state.
PUBLIC_OK.add("GET space-studio/me");
PUBLIC_OK.add("POST space-studio/billing/webhook");
PUBLIC_OK.add("GET space-studio/identities/roblox/callback");
// Sign-in starts for the Space Studio desktop app: signed-out by design, they only redirect (to Google / Roblox OAuth or /signin).
PUBLIC_OK.add("GET space-studio/auth/google/start");
PUBLIC_OK.add("GET space-studio/auth/roblox/start");
// The installer download is public: it only redirects to the latest GitHub release asset (src/lib/space-studio/download.ts).
PUBLIC_OK.add("GET space-studio/download");
// Desktop installers. Without GITHUB_RELEASES_TOKEN this is 404. With it, an allow-listed asset name is redirected to a
// short-lived GitHub asset URL; the token stays on the server (src/lib/desktop/releases.ts openDesktopAsset).
PUBLIC_OK.add("GET desktop/download");
// Keplar Business for ChatGPT (src/lib/chatgpt): OAuth 2.1 + MCP endpoints that ChatGPT's servers call without a Keplar cookie, by design.
PUBLIC_OK.add("GET chatgpt/mcp"); // Always 405 (POST only); no body.
PUBLIC_OK.add("POST chatgpt/mcp"); // initialize / ping / tools/list are static protocol metadata; tools/call authenticates the bearer grant (hash, expiry, resource, client, scope, plan) before any workspace read.
PUBLIC_OK.add("GET chatgpt/oauth/authorize"); // Validates client_id, redirect_uri, PKCE S256, resource and state; the consent page needs a signed-in Business owner (anonymous -> sign-in redirect).
PUBLIC_OK.add("POST chatgpt/oauth/authorize"); // Consent submit: issuer origin + same-origin + signed-in owner + HMAC csrf bound to the request and a cookie nonce, before a code is issued.
PUBLIC_OK.add("POST chatgpt/oauth/revoke"); // RFC 7009: answers {} either way; only deletes a grant whose token secret hash matches, for the published ChatGPT client.
PUBLIC_OK.add("POST chatgpt/oauth/token"); // Code exchange checks client, redirect_uri, resource and the PKCE verifier, single-use (atomic delete); refresh rotates. 400 for anything else.
PUBLIC_OK.add("GET chatgpt/status"); // Signed out: { state: "signed_out" } only; signed in: that account's own connection count, never tokens or grant ids.
// Citation marks for a structured answer. Signed out on purpose: a hostname only (never a URL), refused before any fetch when it is
// not a public host, then fetched with the SSRF-safe reader and returned only if the bytes are a real image. Nothing is stored.
PUBLIC_OK.add("GET favicon");

test("anonymous Business status and handoff expose no account data or sign-in ticket", async () => {
  const { GET: account } = await import("@/app/api/business/account/route");
  const status = await account(call(null, "/api/business/account"));
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.deepEqual(await status.json(), { signedIn: false });
  const { GET: handoff } = await import("@/app/api/business/handoff/route");
  const redirect = await handoff(call(null, `/api/business/handoff?n=${nonceHash(newNonce())}`));
  assert.equal(redirect.status, 303);
  const target = new URL(redirect.headers.get("location")!);
  assert.equal(target.pathname, "/signin");
  assert.equal(target.searchParams.has("t"), false);
});

test("every API route refuses anonymous callers unless reviewed as public", async (t) => {
  const devTools = process.env.KEPLAR_DEV_TOOLS;
  delete process.env.KEPLAR_DEV_TOOLS; // the session helper turns dev tools on; production has them off
  t.after(() => { if (devTools !== undefined) process.env.KEPLAR_DEV_TOOLS = devTools; });
  const offenders: string[] = [];
  let checked = 0;
  for (const f of routeFiles.sort()) {
    const rel = path.relative(root, path.dirname(f)).replace(/\\/g, "/");
    if (OWN_PROTECTION.test(rel)) continue;
    const mod = (await import(pathToFileURL(f).href)) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[m] !== "function") continue;
      checked++;
      const url = "/api/" + rel.replace(/\[\.\.\.(\w+)\]/g, "x/y").replace(/\[(\w+)\]/g, "nope");
      const params = Promise.resolve(new Proxy({}, { get: (_t, k) => (k === "key" ? ["x", "y"] : "nope") }));
      const req = new Request("https://keplar.one" + url, { method: m, headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "9.9.9.9" }, body: m === "GET" ? undefined : "{}" });
      let status = 0;
      try { status = (await mod[m](req, { params })).status; } catch { status = 500; }
      const allowed = PUBLIC_OK.has(`${m} ${rel}`);
      // 401/403/404 = refused. 400/429/503 from a validation or config gate before any data is touched is fine only for reviewed public routes.
      if (!allowed && ![401, 403, 404].includes(status)) offenders.push(`${m} ${rel} -> ${status}`);
    }
  }
  assert.ok(checked > 60, `walked ${checked} handlers`);
  assert.deepEqual(offenders, []);
});

test("billing/checkout and billing routes need a signed-in account before anything else", async () => {
  const { POST } = await import("@/app/api/billing/checkout/route");
  const r = await POST(jsonReq(null, "/api/billing/checkout", "POST", { plan: "plus" }));
  assert.ok([401, 503].includes(r.status), String(r.status));
});

test("cross-user isolation: projects, domains, media, blobs, business data", async () => {
  const a = await signIn("authz-a@example.com", "pro");
  const b = await signIn("authz-b@example.com", "pro");
  assert.notEqual(a.workspaceId, b.workspaceId);
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const t = new Date().toISOString();

  // A's rows (seeded straight into the store; the routes under test only see ids)
  await projects().insert({ id: "prj_authz", workspaceId: a.workspaceId, name: "A site", slug: "a-authz-site", kind: "site", spec: null, draftVersion: 0, files: [], messages: [], liveDeployId: null, publishedAt: null, scan: null, takenDown: false, createdAt: t, updatedAt: t } as never);
  await domains().insert({ id: "dom_authz", workspaceId: a.workspaceId, projectId: "prj_authz", name: "a-authz.example.com", status: "pending" } as never);
  await mediaJobs().insert({ id: "job_authz", workspaceId: a.workspaceId, status: "done", kind: "image", createdAt: t } as never);
  await blobs().put(`media/${a.workspaceId}/secret.png`, Buffer.from("png"), "image/png");
  await agents().insert({ id: "agt_authz", workspaceId: a.workspaceId, name: "A agent", status: "active", autoSend: false, caps: {}, trigger: { type: "manual" }, createdAt: t } as never);
  await approvals().insert({ id: "apr_authz", workspaceId: a.workspaceId, status: "pending", action: { type: "email.send", to: "x@example.com", subject: "s", body: "b" }, createdAt: t } as never);
  await deals().insert({ id: "deal_authz", workspaceId: a.workspaceId, title: "Deal", stage: "lead", value: 10, createdAt: t, updatedAt: t } as never);
  await contacts().insert({ id: "ct_authz", workspaceId: a.workspaceId, name: "Private Person", email: "p@example.com", createdAt: t } as never);

  const gone = (r: Response, what: string) => assert.ok([403, 404].includes(r.status), `${what}: expected 403/404, got ${r.status}`);

  const proj = await import("@/app/api/create/projects/[id]/route");
  gone(await proj.GET(call(b.cookie, "/api/create/projects/prj_authz"), ctx("prj_authz")), "project GET");
  gone(await proj.DELETE(call(b.cookie, "/api/create/projects/prj_authz", { method: "DELETE" }), ctx("prj_authz")), "project DELETE");
  const gen = await import("@/app/api/create/projects/[id]/generate/route");
  const g = await gen.POST(jsonReq(b.cookie, "/api/create/projects/prj_authz/generate", "POST", { prompt: "build me a site" }), ctx("prj_authz"));
  assert.ok([403, 404, 503].includes(g.status), `project generate: ${g.status}`); // 503 = Create not configured in tests; never 200
  const dep = await import("@/app/api/create/projects/[id]/deploy/route");
  gone(await dep.POST(jsonReq(b.cookie, "/api/create/projects/prj_authz/deploy", "POST", {}), ctx("prj_authz")), "project deploy");
  gone(await dep.DELETE(call(b.cookie, "/api/create/projects/prj_authz/deploy", { method: "DELETE" }), ctx("prj_authz")), "project undeploy");

  const dom = await import("@/app/api/domains/[id]/route");
  gone(await dom.GET(call(b.cookie, "/api/domains/dom_authz"), ctx("dom_authz")), "domain GET");
  gone(await dom.DELETE(call(b.cookie, "/api/domains/dom_authz", { method: "DELETE" }), ctx("dom_authz")), "domain DELETE");

  const media = await import("@/app/api/create/media/[id]/route");
  gone(await media.GET(call(b.cookie, "/api/create/media/job_authz"), ctx("job_authz")), "media GET");
  gone(await media.DELETE(call(b.cookie, "/api/create/media/job_authz", { method: "DELETE" }), ctx("job_authz")), "media DELETE");

  const blob = await import("@/app/api/create/blob/[...key]/route");
  const bk = (key: string[]) => ({ params: Promise.resolve({ key }) });
  gone(await blob.GET(call(b.cookie, `/api/create/blob/media/${a.workspaceId}/secret.png`), bk(["media", a.workspaceId, "secret.png"])), "blob GET");
  gone(await blob.GET(call(b.cookie, `/api/create/blob/media/${a.workspaceId}/../${b.workspaceId}/x`), bk(["media", a.workspaceId, "..", b.workspaceId, "x"])), "blob traversal");
  // An encoded slash ("..%2F") arrives decoded inside ONE segment ("../"): B's own prefix, then normalization lands in A's folder.
  gone(await blob.GET(call(b.cookie, `/api/create/blob/media/${b.workspaceId}/..%2F/${a.workspaceId}/secret.png`), bk(["media", b.workspaceId, "../", a.workspaceId, "secret.png"])), "blob encoded-slash traversal");
  gone(await blob.GET(call(b.cookie, `/api/create/blob/media/${b.workspaceId}/..%2F${a.workspaceId}/secret.png`), bk(["media", b.workspaceId, `../${a.workspaceId}`, "secret.png"])), "blob encoded-slash traversal (joined)");
  gone(await blob.GET(call(b.cookie, `/api/create/blob/media/${b.workspaceId}/..%5C${a.workspaceId}/secret.png`), bk(["media", b.workspaceId, `..\\${a.workspaceId}`, "secret.png"])), "blob backslash traversal");
  assert.equal((await blob.GET(call(a.cookie, `/api/create/blob/media/${a.workspaceId}/secret.png`), bk(["media", a.workspaceId, "secret.png"]))).status, 200, "owner can read their own media");

  const agent = await import("@/app/api/business/agents/[id]/route");
  gone(await agent.PATCH(jsonReq(b.cookie, "/api/business/agents/agt_authz", "PATCH", { status: "killed" }), ctx("agt_authz")), "agent PATCH");
  gone(await agent.POST(jsonReq(b.cookie, "/api/business/agents/agt_authz", "POST", {}), ctx("agt_authz")), "agent run");
  const appr = await import("@/app/api/business/approvals/[id]/route");
  gone(await appr.POST(jsonReq(b.cookie, "/api/business/approvals/apr_authz", "POST", { decision: "approve" }), ctx("apr_authz")), "approval decide");
  const deal = await import("@/app/api/business/crm/deals/[id]/route");
  gone(await deal.PATCH(jsonReq(b.cookie, "/api/business/crm/deals/deal_authz", "PATCH", { stage: "won" }), ctx("deal_authz")), "deal PATCH");

  // B's list views contain none of A's data.
  const lists: [string, () => Promise<Response>][] = [
    ["projects", async () => (await import("@/app/api/create/projects/route")).GET(call(b.cookie, "/api/create/projects"))],
    ["domains", async () => (await import("@/app/api/domains/route")).GET(call(b.cookie, "/api/domains"))],
    ["media", async () => (await import("@/app/api/create/media/route")).GET(call(b.cookie, "/api/create/media"))],
    ["agents", async () => (await import("@/app/api/business/agents/route")).GET(call(b.cookie, "/api/business/agents"))],
    ["approvals", async () => (await import("@/app/api/business/approvals/route")).GET(call(b.cookie, "/api/business/approvals"))],
    ["crm", async () => (await import("@/app/api/business/crm/route")).GET(call(b.cookie, "/api/business/crm"))],
    ["inbox", async () => (await import("@/app/api/business/inbox/route")).GET(call(b.cookie, "/api/business/inbox"))],
    ["dashboard", async () => (await import("@/app/api/business/dashboard/route")).GET(call(b.cookie, "/api/business/dashboard"))],
    ["audit", async () => (await import("@/app/api/business/audit/route")).GET(call(b.cookie, "/api/business/audit"))],
    ["export", async () => (await import("@/app/api/account/export/route")).GET(call(b.cookie, "/api/account/export"))],
  ];
  for (const [name, run] of lists) {
    const text = await (await run()).text();
    for (const secret of ["prj_authz", "a-authz-site", "dom_authz", "a-authz.example.com", "job_authz", "agt_authz", "apr_authz", "deal_authz", "Private Person", "p@example.com", a.workspaceId]) {
      assert.ok(!text.includes(secret), `${name} leaked ${secret} to another account`);
    }
  }

  // A's data is untouched after B's attempts.
  assert.ok(await projects().get(a.workspaceId, "prj_authz"));
  assert.ok(await domains().get(a.workspaceId, "dom_authz"));
  assert.equal((await agents().get(a.workspaceId, "agt_authz"))?.status, "active");
  assert.equal((await approvals().get(a.workspaceId, "apr_authz"))?.status, "pending");
  assert.equal((await deals().get(a.workspaceId, "deal_authz"))?.stage, "lead");
});

test("admin surfaces are 404 for signed-in non-admins and anonymous", async () => {
  const u = await signIn("authz-plain@example.com", "business");
  const ov = await import("@/app/api/admin/overview/route");
  const ctl = await import("@/app/api/admin/controls/route");
  for (const cookie of [null, u.cookie]) {
    assert.equal((await ov.GET(call(cookie, "/api/admin/overview"))).status, 404);
    assert.equal((await ctl.POST(jsonReq(cookie, "/api/admin/controls", "POST", { globalStop: true }))).status, 404);
  }
  const abuse = await import("@/app/api/create/abuse/[id]/route");
  const r = await abuse.POST(jsonReq(u.cookie, "/api/create/abuse/x", "POST", { action: "takedown" }), { params: Promise.resolve({ id: "x" }) });
  assert.equal(r.status, 403);
});
