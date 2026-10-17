import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cronBeat, cronState, cronStatus, CRON_JOBS } from "@/lib/ops/health";
import { GET as health } from "@/app/api/health/route";
import { footerNav } from "@/lib/site";
import { sitemapPaths } from "@/app/sitemap";

test("cron state: never, ok, late, failed", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  assert.equal(cronState(null, 30, now), "never");
  assert.equal(cronState({ lastOk: true, lastOkAt: "2026-10-04T05:17:00Z" }, 30, now), "ok");
  assert.equal(cronState({ lastOk: true, lastOkAt: "2026-10-02T05:17:00Z" }, 30, now), "late");
  assert.equal(cronState({ lastOk: false, lastOkAt: "2026-10-04T05:17:00Z" }, 30, now), "failed");
  assert.equal(cronState({ lastOk: true, lastOkAt: null }, 30, now), "never");
});

test("cron heartbeat is recorded and /api/health?crons=1 reports it without leaking anything else", async () => {
  const before = await cronStatus();
  assert.deepEqual(before.map((c) => c.name), CRON_JOBS.map((j) => j.name));
  await cronBeat("domains", true);
  const res = await health(new Request("https://keplar.one/api/health?crons=1"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; crons: { name: string; state: string }[] };
  assert.equal(body.ok, true);
  assert.equal(body.crons.find((c) => c.name === "domains")?.state, "ok");
  await cronBeat("domains", false);
  assert.equal((await cronStatus()).find((c) => c.name === "domains")?.state, "failed");
  // plain /api/health keeps its small shape
  const plain = (await (await health()).json()) as Record<string, unknown>;
  assert.equal("crons" in plain, false);
});

test("cron routes record a heartbeat on success and on failure", () => {
  for (const f of ["src/app/api/cron/domains/route.ts", "src/app/api/cron/learning/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /cronBeat\("\w+", true\)/, f);
    assert.match(src, /cronBeat\("\w+", false\)/, f);
  }
});

test("/status is linked in the footer, indexable and not in the sitemap", () => {
  assert.ok(footerNav.some((c) => c.links.some((l) => l.href === "/status")));
  assert.ok(!sitemapPaths.includes("/status"));
  assert.doesNotMatch(readFileSync("src/app/(marketing)/status/page.tsx", "utf8"), /noindex/);
});

test("Keplar's pages carry no noindex (content, auth and missing pages alike); private share links keep theirs", () => {
  for (const f of ["status", "simulation", "feedback", "signin", "signup", "templates/[slug]", "account", "checkout"]) {
    assert.doesNotMatch(readFileSync(`src/app/(marketing)/${f}/page.tsx`, "utf8"), /noindex|index: false/, f);
  }
  // The one content exception: a comparison the owner has not approved is noindex. Approved pages in the same file stay indexable.
  assert.match(readFileSync("src/app/(marketing)/vs/[slug]/page.tsx", "utf8"), /noindex: v\.approved === false/);
  assert.doesNotMatch(readFileSync("src/lib/i18n/seo.ts", "utf8"), /status === "stable"|index: false/, "every locale and localized page is indexable");
  for (const f of ["r/[token]/page.tsx", "c/[token]/page.tsx", "sp/[token]/page.tsx"]) {
    assert.match(readFileSync(`src/app/(marketing)/${f}`, "utf8"), /index: false/, f);
  }
});
