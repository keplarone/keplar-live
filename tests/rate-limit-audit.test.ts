import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PLAN_LIMITS } from "@/lib/orchestration/limits";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";

const ORDER = ["free", "lite", "plus", "pro", "business"] as const;

test("every plan has per-minute, daily, concurrency and size caps, and a higher plan never gets a lower cap", () => {
  assert.deepEqual(Object.keys(PLAN_LIMITS).sort(), [...ORDER].sort());
  assert.deepEqual(Object.keys(PLAN_ALLOWANCES).sort(), [...ORDER].sort());
  assert.deepEqual(Object.keys(ENTITLEMENTS).sort(), [...ORDER].sort());
  const keys = ["burstPerMin", "dailyRequests", "dailyIpRequests", "concurrent", "maxPromptChars", "maxHistoryChars", "maxAttachments", "maxAttachmentBytes", "dailyFanoutRuns", "maxRequestUsd"] as const;
  for (const k of keys) {
    for (let i = 0; i < ORDER.length; i++) {
      const v = PLAN_LIMITS[ORDER[i]!][k];
      assert.ok(Number.isFinite(v) && v >= 0, `${ORDER[i]}.${k} is a finite number`);
      if (i) assert.ok(v >= PLAN_LIMITS[ORDER[i - 1]!][k], `${ORDER[i]}.${k} is not below ${ORDER[i - 1]}`);
    }
  }
  for (const k of ["burstPerMin", "dailyRequests", "concurrent"] as const) assert.ok(PLAN_LIMITS.free[k] > 0, `Free has a positive ${k}`);
  for (let i = 1; i < ORDER.length; i++) assert.ok(ENTITLEMENTS[ORDER[i]!].rpm >= ENTITLEMENTS[ORDER[i - 1]!].rpm, "requests per minute never shrink on a higher plan");
  for (const p of ORDER) assert.ok(ENTITLEMENTS[p].rpm > 0 && Number.isFinite(ENTITLEMENTS[p].rpm));
});

test("spend caps: Free can only use $0 models; Lite, Plus and Pro have a monthly budget, a daily spend cap below it, and a per-request cap below the daily cap", () => {
  assert.equal(PLAN_LIMITS.free.maxRequestUsd, 0, "Free requests may not cost anything");
  assert.equal(PLAN_ALLOWANCES.free.models, "free-only");
  assert.equal(PLAN_ALLOWANCES.free.monthlyBudgetUsd, 0);
  let lastDaily = 0;
  for (const p of ["lite", "plus", "pro"] as const) {
    const daily = PLAN_LIMITS[p].dailyUsd;
    const monthly = PLAN_ALLOWANCES[p].monthlyBudgetUsd;
    assert.ok(daily !== null && daily > lastDaily, `${p} has a daily spend cap above the previous plan's`);
    assert.ok(monthly !== null && monthly > 0 && daily < monthly, `${p}: daily cap is below the monthly budget`);
    assert.ok(PLAN_LIMITS[p].maxRequestUsd <= daily, `${p}: one request cannot cost more than a day's cap`);
    lastDaily = daily;
  }
  assert.equal(PLAN_ALLOWANCES.lite.deepResearch, false);
  assert.equal(PLAN_LIMITS.lite.maxDeepResearchUsd, 0, "no Deep Research budget where the plan has no Deep Research");
});

test("Business is self-serve now, so it is capped: bounded monthly budget, a daily dollar cap, per-request cap and request counts (documented in known-gaps)", () => {
  assert.equal(PLAN_ALLOWANCES.business.monthlyBudgetUsd, 60);
  assert.equal(PLAN_LIMITS.business.dailyUsd, 150);
  assert.ok(PLAN_LIMITS.business.maxRequestUsd > 0 && PLAN_LIMITS.business.dailyRequests > 0);
  assert.match(readFileSync("docs/known-gaps.md", "utf8"), /Business spend caps are tier-wide/);
});

// ---- Every state-changing API route has a limit, or a reviewed reason not to ----

function routes(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (f === "route.ts") out.push(p);
  }
  return out;
}
const API = "src/app/api";
const LIMITER = /limitRequest\(|rateLimit\(|enterUsage|dailyLimit\(|minuteLimit\(|chargeUnits/;
/** Helpers that apply a per-account limit before returning. Each is checked below. */
const HELPERS: Record<string, string> = { "owner(": "src/app/api/business/_owner.ts", "mcpOwner(": "src/app/api/mcp/_ctx.ts", "projectOwner(": "src/lib/projects/api.ts", "authenticateKey(": "src/lib/api/keys.ts", "teamAs(": "src/lib/team/api.ts", "accountOf(": "src/lib/team/api.ts", "wantsSession(": "src/lib/wants/http.ts" /* Keplar Wants: 120/min per IP and account; PIN checks also 10 per 15 min (src/lib/wants/pin.ts) */, "requireBusiness(": "src/lib/business/require.ts", "cloudOwner(": "src/lib/roblox-cloud/api.ts", "renderOwner(": "src/lib/blender-cloud/api.ts" };
/** Cost-bearing work whose limits live in the library the route calls (checked: that file must contain a limiter). */
const LIB_LIMITED: Record<string, string> = {
  "sites/[id]/generate": "src/lib/site-builder/job.ts",
  "sites/[id]/estimate": "src/lib/site-builder/job.ts",
  "images/estimate": "src/lib/images/job.ts",
  "domains": "src/lib/domains/service.ts",
  "domains/[id]": "src/lib/domains/service.ts",
  "sites/[id]": "src/lib/domains/service.ts",
  "embed/ask": "src/lib/embed/store.ts", // public widget: resolveWidgetForAsk limits per widget (minute, day) and per IP before any model call
  "presence": "src/lib/traffic/presence.ts", // in-memory per-visitor and per-minute limits (a shared limiter would write to the database on every heartbeat)
};
/** Authenticated by a signature or an admin check instead of a rate limit. */
const SIGNED: Record<string, RegExp> = {
  "webhooks/whop": /signature|verify/i,
  "webhooks/apple": /verifySignedNotification|appleIapConfigured/i,
  "webhooks/higgsfield": /signature|verify|secret/i,
  "business/stripe/webhook": /signature|constructEvent|verify/i,
  "admin/trends": /requireAdmin\(/,
  "create/abuse/[id]": /KEPLAR_ADMIN_TOKEN/,
  "roblox-cloud/worker": /CRON_SECRET[\s\S]*timingSafeEqual/, // internal hand-over between Roblox Cloud slices: Keplar itself only
  "blender-cloud/worker": /CRON_SECRET[\s\S]*timingSafeEqual/, // internal hand-over between Blender Cloud slices: Keplar itself only
};
/** Cheap signed-in deletes and preference writes: no model, mail, payment or domain call. */
const CRUD = ["chats", "sites/assets/[id]", "images/[id]", "create/projects/[id]", "learning/consent", "memory/erase", "faq/consent", "slides/decks/[id]", "study/sets/[id]", "study/sets/[id]/progress"];
const COSTLY_IMPORT = /@\/lib\/(orchestration|site-builder\/job|images\/job|higgsfield|domains|business\/agents|accounts\/outbox|mcp\/gateway|tools\/run)|openrouter|stripe|sendEmail/i;

test("every state-changing API route has a rate limit, a limiting helper or library, a signature/admin check, or is a reviewed cheap write", () => {
  const problems: string[] = [];
  let checked = 0;
  for (const file of routes(API)) {
    const src = readFileSync(file, "utf8");
    if (!/export (async )?function (POST|PUT|PATCH|DELETE)\b/.test(src)) continue;
    checked++;
    const id = path.relative(API, path.dirname(file)).split(path.sep).join("/");
    if (LIMITER.test(src)) continue;
    const helper = Object.keys(HELPERS).find((h) => src.includes(h));
    if (helper) {
      if (!LIMITER.test(readFileSync(HELPERS[helper]!, "utf8"))) problems.push(`${id}: helper ${helper} no longer limits`);
      continue;
    }
    if (LIB_LIMITED[id]) {
      if (!LIMITER.test(readFileSync(LIB_LIMITED[id]!, "utf8"))) problems.push(`${id}: ${LIB_LIMITED[id]} has no limiter`);
      continue;
    }
    if (SIGNED[id]) {
      if (!SIGNED[id]!.test(src)) problems.push(`${id}: expected a signature or admin check`);
      continue;
    }
    if (CRUD.includes(id)) {
      if (COSTLY_IMPORT.test(src)) problems.push(`${id}: listed as a cheap write but calls costly code; add a limit`);
      if (!/currentWorkspace|slidesWorkspace|studyWorkspace|getSession|requireAdmin|cookies\(/.test(src) && id !== "faq/consent") problems.push(`${id}: cheap write without a session check`);
      continue;
    }
    problems.push(`${id}: no rate limit and not reviewed`);
  }
  assert.ok(checked > 80, `scanned ${checked} routes`);
  assert.deepEqual(problems, []);
});

test("the reviewed lists have no stale entries", () => {
  const ids = new Set(routes(API).map((f) => path.relative(API, path.dirname(f)).split(path.sep).join("/")));
  for (const id of [...Object.keys(LIB_LIMITED), ...Object.keys(SIGNED), ...CRUD]) assert.ok(ids.has(id), `${id} no longer exists; remove it from the audit`);
});
