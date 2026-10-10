import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTimeZone, cronMatches, describeCron, latestSlot, minIntervalMinutes, nextSlot } from "@/lib/business/cron";

const NY = "America/New_York";

test("a cron in a time zone follows the wall clock across daylight saving", () => {
  // 08:00 in New York is 12:00 UTC in summer (EDT) and 13:00 UTC in winter (EST).
  assert.ok(cronMatches("0 8 * * *", new Date("2026-10-04T12:00:00Z"), NY));
  assert.ok(!cronMatches("0 8 * * *", new Date("2026-10-04T13:00:00Z"), NY));
  assert.ok(cronMatches("0 8 * * *", new Date("2026-12-04T13:00:00Z"), NY));
  assert.ok(!cronMatches("0 8 * * *", new Date("2026-12-04T12:00:00Z"), NY));
  // the clocks went back on 2026-11-01: the day before is still EDT, the day after EST
  assert.equal(nextSlot("0 8 * * *", new Date("2026-10-31T13:00:00Z"), NY), "2026-11-01T13:00:00.000Z");
  assert.equal(nextSlot("0 8 * * *", new Date("2026-10-30T13:00:00Z"), NY), "2026-10-31T12:00:00.000Z");
});

test("weekday and day-of-week are read in the zone too (Monday 08:00 New York = Monday 12:00 UTC; Sunday 22:00 New York is Monday 02:00 UTC)", () => {
  assert.ok(cronMatches("0 8 * * 1", new Date("2026-10-05T12:00:00Z"), NY));
  assert.ok(cronMatches("0 22 * * 0", new Date("2026-10-05T02:00:00Z"), NY));
  assert.ok(!cronMatches("0 22 * * 1", new Date("2026-10-05T02:00:00Z"), NY));
});

test("latestSlot with a zone finds the slot inside the window", () => {
  assert.equal(latestSlot("0 8 * * *", new Date("2026-10-04T12:07:20Z"), 15, NY), "2026-10-04T12:00:00.000Z");
  assert.equal(latestSlot("0 8 * * *", new Date("2026-10-04T12:20:00Z"), 15, NY), null);
  assert.equal(latestSlot("0 8 * * *", new Date("2026-10-04T18:00:00Z"), 24 * 60, NY), "2026-10-04T12:00:00.000Z", "a daily window catches up the day's slot");
});

test("UTC stays the default and unknown zones are rejected", () => {
  assert.ok(cronMatches("0 13 * * 1", new Date("2026-09-28T13:00:00Z")));
  assert.equal(assertTimeZone(NY), NY);
  assert.throws(() => assertTimeZone("Mars/Olympus"), /Unknown time zone/);
});

test("minIntervalMinutes: the fastest cadence of a schedule", () => {
  const from = new Date("2026-10-04T00:00:00Z");
  assert.equal(minIntervalMinutes("*/5 * * * *", undefined, from), 5);
  assert.equal(minIntervalMinutes("0 * * * *", undefined, from), 60);
  assert.equal(minIntervalMinutes("0 8 * * *", NY, from), 1440);
  assert.equal(minIntervalMinutes("0 9 * * 1", undefined, from), 7 * 1440);
  assert.equal(minIntervalMinutes("0 9 1 * *", undefined, from), 15 * 1440, "less than twice in 15 days");
  assert.equal(minIntervalMinutes("0 8,9 * * *", NY, from), 60);
});

test("describeCron: plain words for the common shapes, the raw cron otherwise", () => {
  assert.equal(describeCron("0 8 * * *", NY), "Every day at 08:00 (America/New_York)");
  assert.equal(describeCron("30 9 * * 1-5", NY), "Weekdays at 09:30 (America/New_York)");
  assert.equal(describeCron("0 13 * * 1"), "Mon at 13:00 UTC");
  assert.equal(describeCron("0 15 * * 2,4"), "Tue + Thu at 15:00 UTC");
  assert.equal(describeCron("0 */6 * * *"), "Every 6 hours at :00");
  assert.equal(describeCron("*/15 * * * *"), "Every 15 minutes");
  assert.equal(describeCron("5 4 1 * *"), "5 4 1 * * UTC");
  assert.equal(describeCron("nonsense"), "nonsense");
});
