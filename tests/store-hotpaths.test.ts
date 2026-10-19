import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatRoutes, customDomains, dashboardTraffic, projectCounts, storeMethods } from "./helpers/store-hotpaths";
import { authSecretMissingInProduction, isProductionRuntime } from "@/lib/accounts/secret";
import { healthSummary } from "@/lib/ops/health";
import { listOutbox, sendEmail } from "@/lib/accounts/outbox";

// File store (local development and tests). tests/store-hotpaths-neon.test.ts runs the same checks against Postgres semantics.

test("file store: listFields / count / countBy / listSystemBy / scoped findSystemBy", () => storeMethods("hot_file_docs"));
test("file store: GET /api/chats lists without messages, same shape; the saved-chat cap still holds", () => chatRoutes("hot-chats-file@example.com"));
test("file store: GET /api/projects counts per project", () => projectCounts("hot-projects-file@example.com"));
test("file store: Business dashboard traffic reads only the last 14 days", () => dashboardTraffic("hotdashfile"));
test("file store: custom domains resolve by name, active only, www for apex", () => customDomains("f"));

test("production without BETTER_AUTH_SECRET is detected (never during a build or a test run)", () => {
  const secret = "s".repeat(32);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "development" }), false);
  assert.equal(isProductionRuntime({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }), false, "next build");
  assert.equal(isProductionRuntime({ VERCEL_ENV: "production", NODE_ENV: "test" }), false, "tests");
  assert.equal(authSecretMissingInProduction({ VERCEL_ENV: "production" }), true);
  assert.equal(authSecretMissingInProduction({ VERCEL_ENV: "production", BETTER_AUTH_SECRET: "short" }), true, "too short counts as missing");
  assert.equal(authSecretMissingInProduction({ VERCEL_ENV: "production", BETTER_AUTH_SECRET: secret }), false);
  assert.equal(authSecretMissingInProduction({}), false, "development uses the dev secret");
});

test("/api/health fails (503) in production while the auth secret is missing, and says only that", async (t) => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET };
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...a: unknown[]) => void errors.push(a));
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  process.env.VERCEL_ENV = "production";
  delete process.env.BETTER_AUTH_SECRET;
  const bad = await healthSummary();
  assert.equal(bad.status, 503);
  assert.equal(bad.body.ok, false);
  assert.equal("error" in bad.body && bad.body.error, "auth secret not configured");
  assert.equal(bad.body.security.authSecret, false);
  assert.ok(errors.some((a) => /CRITICAL/.test(String(a[0]))), "logged loudly");
  process.env.BETTER_AUTH_SECRET = "a-long-enough-production-secret-0123456789";
  const fileStore = await healthSummary();
  assert.equal(fileStore.status, 503, "production on the file store is unhealthy even when the auth secret is set");
  assert.equal(fileStore.body.ok, false);
  assert.equal("error" in fileStore.body && fileStore.body.error, "database not configured");
  assert.equal(fileStore.body.store, "file");
  assert.ok(errors.some((a) => /ephemeral file store/.test(String(a[0]))), "file store logged loudly");
  assert.doesNotMatch(JSON.stringify(errors), /postgres(ql)?:\/\//, "the log does not contain a connection string");
});

test("outbox: production logs and stores a masked recipient; development keeps it", async (t) => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, KEPLAR_DEV_TOOLS: process.env.KEPLAR_DEV_TOOLS, RESEND_API_KEY: process.env.RESEND_API_KEY };
  const logs: string[] = [];
  t.mock.method(console, "info", (...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  delete process.env.RESEND_API_KEY;
  delete process.env.KEPLAR_DEV_TOOLS;
  process.env.VERCEL_ENV = "production";
  await sendEmail({ to: "jane.doe@example.com", subject: "Your link", text: "https://keplar.one/secret-link", kind: "hot-test-prod" });
  const prod = (await listOutbox()).find((m) => m.kind === "hot-test-prod")!;
  assert.equal(prod.to, "j***@example.com");
  assert.equal(prod.text, "[withheld]");
  assert.ok(logs.some((l) => l.includes("j***@example.com")) && !logs.some((l) => l.includes("jane.doe")), "the log never has the address");

  delete process.env.VERCEL_ENV;
  await sendEmail({ to: "dev.person@example.com", subject: "Your link", text: "body", kind: "hot-test-dev" });
  assert.equal((await listOutbox()).find((m) => m.kind === "hot-test-dev")?.to, "dev.person@example.com", "local development keeps the address (sign-in links are clicked from it)");
});
