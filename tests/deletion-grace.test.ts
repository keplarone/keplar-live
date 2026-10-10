import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deletionDate, graceDays, scheduledEmail } from "../src/lib/privacy/deletion";

test("grace period defaults to 14 days, is configurable within 0..90, and ignores junk", () => {
  assert.equal(graceDays(undefined), 14);
  assert.equal(graceDays(""), 14);
  assert.equal(graceDays("7"), 7);
  assert.equal(graceDays("0"), 0);
  assert.equal(graceDays("-3"), 14);
  assert.equal(graceDays("400"), 14);
  assert.equal(graceDays("abc"), 14);
  assert.equal(deletionDate(new Date("2026-10-04T00:00:00Z"), 14).toISOString(), "2026-10-18T00:00:00.000Z");
});

test("the scheduled-deletion email states the date, says nothing is removed yet, and tells the owner how to cancel", () => {
  const m = scheduledEmail({ on: new Date("2026-10-18T12:00:00Z"), accountUrl: "https://keplar.one/account#data" });
  assert.match(m.text, /2026-10-18/);
  assert.match(m.text, /Until then nothing is removed/);
  assert.match(m.text, /Cancel deletion/);
  assert.match(m.text, /account#data/);
});

test("the delete route schedules by default, deletes at once only on request or without a database, and the nightly job purges due accounts", () => {
  const route = readFileSync("src/app/api/account/delete/route.ts", "utf8");
  assert.match(route, /persistenceEnabled\(\) && immediately !== true/);
  assert.match(route, /scheduleDeletion/);
  assert.match(route, /action === "cancel"/);
  // The subscription guard still runs before anything is scheduled or deleted.
  assert.ok(route.indexOf("subscription_active") < route.indexOf("scheduleDeletion({"));
  const cron = readFileSync("src/app/api/cron/learning/route.ts", "utf8");
  assert.match(cron, /purgeDueDeletions\(\)/);
  const lib = readFileSync("src/lib/privacy/deletion.ts", "utf8");
  assert.match(lib, /activeSubscription\(row\.billing\)/);
});
