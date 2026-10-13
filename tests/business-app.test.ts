import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { businessHost, businessMoved, proxy } from "@/proxy";
import { isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { cookieValue, newNonce, nonceHash, signTicket, TICKET_TTL_SECONDS, verifyTicket } from "@/lib/business/handoff";

const SECRET = "test-secret-for-handoff-0123456789abcdef";
const who = { userId: "u_1", email: "pat@example.com", name: "Pat" };

test("handoff: a ticket signs in only the browser holding the matching nonce, within the minute", () => {
  const nonce = newNonce();
  const t = signTicket(SECRET, who, nonceHash(nonce));
  assert.deepEqual(verifyTicket(SECRET, t, nonce), { ok: true, user: who });
  assert.deepEqual(verifyTicket(SECRET, t, newNonce()), { ok: false, reason: "wrong_browser" }, "a leaked ticket is useless elsewhere");
  assert.deepEqual(verifyTicket(SECRET, t, null), { ok: false, reason: "wrong_browser" });
  assert.deepEqual(verifyTicket(SECRET, t, nonce, Date.now() + (TICKET_TTL_SECONDS + 5) * 1000), { ok: false, reason: "expired" });
  assert.deepEqual(verifyTicket("other-secret", t, nonce), { ok: false, reason: "invalid" });
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), e: "boss@example.com" })).toString("base64url");
  assert.deepEqual(verifyTicket(SECRET, `${forged}.${sig}`, nonce), { ok: false, reason: "invalid" }, "the email can't be swapped");
  for (const bad of [undefined, "", "x", "a.b.c", `${payload}.`, 42]) assert.equal(verifyTicket(SECRET, bad, nonce).ok, false);
});

test("handoff: a 2FA user's Business session is complete, because only a fully verified keplar.one session can mint the ticket", async () => {

  // The Business host has no two-factor page; without this a 2FA user's Business session stays mfa_pending (signed out in a loop).
  assert.match(readFileSync("src/lib/accounts/business-auth.ts", "utf8"), /provider: "business", remember: true, secondFactorDone: true/);
  // ...which is safe only while keplar.one refuses to sign tickets for a session still waiting on its second factor.
  assert.match(readFileSync("src/app/api/business/handoff/route.ts", "utf8"), /const session = await getSession\(req\.headers\);\s*if \(!session\)/);
  assert.match(readFileSync("src/lib/accounts/persist.ts", "utf8"), /if \(bool\(r\.mfa_pending\)\) return \{ ok: false, reason: "mfa_required" \}/);
});

test("handoff: cookie parsing and safe next paths (no open redirect, no internal /biz or /api)", () => {
  assert.equal(cookieValue(new Headers({ cookie: "a=1; kb_handoff=abc%3D; b=2" }), "kb_handoff"), "abc=");
  assert.equal(cookieValue(new Headers({ cookie: "a=1" }), "kb_handoff"), null);
  assert.equal(safeBusinessNext("/work?tab=projects"), "/work?tab=projects");
  assert.equal(safeBusinessNext("/account"), "/account");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "work", "/biz/work", "/api/auth/x", null, "/x\u0000y"]) assert.equal(safeBusinessNext(bad), "/work", String(bad));
});

test("hosts: business.keplar.one and business.localhost are the Business app; keplar.one is not", () => {
  assert.ok(isBusinessHost("business.keplar.one"));
  assert.ok(isBusinessHost("business.localhost"));
  assert.ok(!isBusinessHost("keplar.one"));
  assert.ok(!isBusinessHost("business.keplar.one.evil.test"));
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url, init);

test("business host: public paths map onto /biz, the internal prefix is never a second URL, /api is left to the API guard", () => {
  const rewritten = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("x-middleware-rewrite");
  assert.equal(new URL(rewritten("/")!).pathname, "/biz");
  assert.equal(new URL(rewritten("/work")!).pathname, "/biz/work");
  assert.equal(new URL(rewritten("/account?tier=growth")!).search, "?tier=growth");
  assert.equal(new URL(rewritten("/signin")!).pathname, "/biz/signin");
  const redirect = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("location");
  assert.equal(redirect("/biz/work"), "https://business.keplar.one/work");
  assert.equal(redirect("/business-landing"), "https://business.keplar.one/");
  assert.equal(businessHost(req("https://business.keplar.one/api/business/account")), null);
});

test("keplar.one: the old Business URLs move to the Business app; Keplar One paths are untouched", () => {
  const loc = (p: string) => businessMoved(req(`https://keplar.one${p}`))?.headers.get("location") ?? null;
  assert.match(loc("/app/work")!, /\/work$/);
  assert.match(loc("/business-account?tier=scale&cycle=annual")!, /\/account\?tier=scale&cycle=annual$/);
  assert.match(loc("/biz/work")!, /\/work$/, "internal routes are not served on keplar.one");
  for (const p of ["/app", "/app/ask", "/account", "/signin", "/pricing", "/workshop"]) assert.equal(loc(p), null, p);
});

test("business host /api gets the same guard as keplar.one: a cross-site POST is refused", async () => {
  const r = await proxy(req("https://business.keplar.one/api/business/account", { method: "POST", headers: { host: "business.keplar.one", origin: "https://evil.test" } }));
  assert.equal(r.status, 403);
  const ok = await proxy(req("https://business.keplar.one/api/business/account", { method: "POST", headers: { host: "business.keplar.one", origin: "https://business.keplar.one" } }));
  assert.notEqual(ok.status, 403);
  assert.ok(ok.headers.get("x-request-id"), "it went through the API pipeline");
});

test("business host: the favicon and touch icons are the Keplar Business mark, kept transparent; Keplar One keeps its own", async () => {
  const { BUSINESS_ICONS } = await import("@/lib/business-site");
  const sharp = (await import("sharp")).default;

  const target = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("x-middleware-rewrite");
  for (const [p, file] of [["/favicon.ico", "/business/favicon.ico"], ["/apple-touch-icon.png", "/business/apple-icon.png"], ["/icon.png", "/business/icon.png"], ["/icon.svg", "/business/icon.png"]]) {
    assert.equal(new URL(target(p)!).pathname, file, p);
  }
  assert.equal(businessMoved(req("https://keplar.one/favicon.ico")), null, "keplar.one serves Keplar One's favicon");
  assert.deepEqual(BUSINESS_ICONS.shortcut, ["/business/favicon.ico"]);
  for (const f of ["icon.png", "icon-192.png", "apple-icon.png"]) {
    const { data, info } = await sharp(`public/business/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0, `${f}: transparent corner`);
    const c = (Math.floor(info.height * 0.68) * info.width + Math.floor(info.width * 0.62)) * 4; // inside the circle
    assert.ok(data[c + 3] > 240 && Math.max(data[c], data[c + 1], data[c + 2]) < 60, `${f}: the black mark`);
  }
  const ico = readFileSync("public/business/favicon.ico");
  assert.equal(ico.readUInt16LE(2), 1, "ico type");
  assert.equal(ico.readUInt16LE(4), 3, "16, 32 and 48 px frames");
});

test("every workspace tab uses the Business theme: the embedded Keplar One screens read re-pointed tokens and the Business sans (Google Sans)", () => {
  const ws = readFileSync("src/components/business-app/workspace.module.css", "utf8");
  const root = ws.slice(ws.indexOf(".root {"), ws.indexOf("}", ws.indexOf(".root {")));
  // Create, Agents, Approvals, Operations and Integrations are Keplar One components: their palette, accent, buttons and fonts.
  for (const token of ["--c-canvas: var(--w-bg)", "--c-surface-1: var(--w-panel)", "--c-ink: var(--w-ink)", "--c-border: var(--w-line)", "--c-accent: var(--w-accent)", "--btn-p-bg: var(--w-ink)", "--font-sans: var(--kb-sans)", "--f-sans: var(--kb-sans)"]) {
    assert.ok(root.includes(token), `workspace root re-points ${token}`);
  }
  // Create redefines its own palette on its root, so it needs its own Business override (only while the workspace is open).
  assert.match(readFileSync("src/components/create/workspace/ws.module.css", "utf8"), /:global\(html\[data-business-app\]\) \.root \{[^}]*--ws-bg: #0a0a0a;/);
  assert.match(readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8"), /root\.setAttribute\("data-business-app", ""\)/);
});

test("Agents, Approvals, Operations, Integrations and Create look like the workspace's own pages inside Business", () => {
  const os = readFileSync("src/components/business/BusinessOS.tsx", "utf8");
  // Embedded: the section's own title, one line and underline tabs for that section only (no "Business" bar or pill rail).
  assert.match(os, /\{embedded \? null : <div className=\{s\.bar\}>/);
  assert.match(os, /<EmbeddedHead tab=\{tab\}/);
  for (const t of ["Operations", "Agents", "Approvals", "Integrations"]) assert.match(os, new RegExp(`title: "${t}"`));
  const osCss = readFileSync("src/components/business/business.module.css", "utf8");
  assert.match(osCss, /\.shell\[data-embedded\] \.card, \.shell\[data-embedded\] \.notice, \.shell\[data-embedded\] \.col \{\s*border: 0; border-radius: 12px; padding: 16px;/);
  // Create: underline tabs and the New chat composer, only while the workspace is open.
  assert.match(readFileSync("src/components/create/apps/studio.module.css", "utf8"), /:global\(html\[data-business-app\]\) \.calm \.calmCard \{/);
  for (const f of ["src/components/create/images.module.css", "src/components/create/video/video.module.css"]) {
    assert.match(readFileSync(f, "utf8"), /:global\(html\[data-business-app\]\) \.root \.panel \{ border-radius: 12px;/, f);
  }
  // Keplar One's global button lift and drop shadow stay out of the whole workspace (they are !important, so this is the only way).
  const redesign = readFileSync("src/styles/redesign.css", "utf8");
  assert.equal((redesign.match(/:not\(html\[data-business-app\] \*\)/g) ?? []).length, 5);
  // Icon-only detection needs an aria-label: CSS can't see text, so "Options ▾" was squashed to 28px.
  const ws = readFileSync("src/components/business-app/workspace.module.css", "utf8");
  assert.match(ws, /\[aria-label\]:has\(> svg:only-child\)\) \{\s*width: 28px;/);
  // No Keplar One brand in the Business window's title bar.
  assert.match(readFileSync("src/components/desktop/DesktopTitleBar.module.css", "utf8"), /:global\(html\[data-business-app\]\) \.brand \{ visibility: hidden; \}|\.search, :global\(html\[data-business-app\]\) \.brand \{ visibility: hidden; \}/);
});

test("Business settings: a popover over the workspace (never a page), from the account menu or Ctrl+,; every section on a real endpoint", async () => {
  const { SETTINGS_SECTIONS, isSettingsSection, settingsSectionFrom } = await import("@/components/business-app/settings-sections");
  assert.deepEqual(SETTINGS_SECTIONS.map((x) => x.id), ["general", "ai", "editor", "agents", "connections", "security", "computer", "billing", "team"]);
  assert.equal(isSettingsSection("billing"), true);
  assert.equal(isSettingsSection("plan"), false);
  assert.equal(settingsSectionFrom("plan"), "billing", "links saved before the popover still land on the right section");
  assert.equal(settingsSectionFrom("nope"), "general");
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  assert.ok(ws.includes(`onSettings={() => openSettings("general")}`), "the account menu opens Business settings, not Keplar One");
  assert.ok(ws.includes(`key === ",") { e.preventDefault(); setSettings(`), "Ctrl+, (⌘,) opens it");
  assert.ok(!ws.includes(`at: "settings"`), "settings is never a view: the work underneath stays mounted");
  assert.ok(ws.includes(`{settings ? <Settings section={settings}`));
  const page = readFileSync("src/components/business-app/Settings.tsx", "utf8");
  assert.ok(page.includes(`role="dialog" aria-modal="true"`));
  assert.ok(page.includes(`e.key === "Escape"`));
  for (const endpoint of ['"/api/business/account", { method: "POST"', '"/api/billing/portal"', 'href="/api/account/export"', '"/api/business/dashboard"', '"/api/business/agents/halt"']) assert.ok(page.includes(endpoint), endpoint);
  assert.ok(page.includes("signOutOfBusiness()"));
  // What the workspace can't do yet is labelled, never simulated.
  // Computer use is the desktop app's (window.keplarComputer); the browser says so instead of simulating it.
  assert.ok(page.includes("Desktop app only"));
  assert.ok(readFileSync("src/components/business-app/Computer.tsx", "utf8").includes("Runs in the Keplar Business desktop app"));
  // Claims stay within the privacy policy: paid requests go only to endpoints that say they do not train on prompts.
  assert.match(page, /send requests only to model endpoints that say they do not train on prompts/);
  assert.doesNotMatch(page, /never used to train|not used to train/i);
});

test("one Business design system: the site and the workspace read the same tokens, and Keplar One's marketing layer stays out", () => {
  const tokens = readFileSync("src/components/business-site/tokens.css", "utf8");
  for (const t of ["--kb-bg:", "--kb-ink:", "--kb-border:", "--kb-r-pill:", "--kb-ease:"]) assert.ok(tokens.includes(t), t);
  assert.ok(tokens.includes("[data-kb] { --kb-d-1: 0ms;"), "reduced motion zeroes every duration");
  assert.ok(readFileSync("src/app/(business)/layout.tsx", "utf8").includes(`data-kb=""`));
  assert.ok(readFileSync("src/app/(business-app)/layout.tsx", "utf8").includes(`data-kb=""`));
  assert.ok(readFileSync("src/components/business-app/workspace.module.css", "utf8").includes("--w-bg: var(--kb-bg)"));
  const redesign = readFileSync("src/styles/redesign.css", "utf8");
  assert.ok(redesign.includes("#main:not([data-kb]) h1 {"));
  assert.equal(redesign.split(":not([data-kb] *)").length - 1, 5, "no button lift or shadow inside Business");
});

test("Business storefront: the hero and its demo are honest", () => {
  const store = readFileSync("src/components/business-site/Storefront.tsx", "utf8");
  for (const copy of ["Build anything.", "Let intelligence handle the complexity.", ">Start Building<", ">Explore Keplar Business<"]) assert.ok(store.includes(copy), copy);
  assert.doesNotMatch(store, /testimonial|trusted by|customers love|SOC ?2|ISO ?27001|99\.9/i, "no invented credibility");
  const demo = readFileSync("src/components/business-site/BuildDemo.tsx", "utf8");
  assert.ok(demo.includes("Demo · example session"), "the demo says it is a demo");
  assert.ok(demo.includes("prefers-reduced-motion: reduce"));
  for (const stage of ["Understand the task", "Inspect the code", "Write the change", "Run the tests", "Open a live preview", "Hand over for review"]) assert.ok(demo.includes(stage), stage);
});
