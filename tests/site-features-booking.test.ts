import { test } from "node:test";
import assert from "node:assert/strict";
import { freeSlots, parseAvailability, whenLabel, zonedToUtc } from "../src/lib/site-builder/features/booking";

test("availability: defaults and ranges", () => {
  const a = parseAvailability({});
  assert.deepEqual([...a.days].sort(), [1, 2, 3, 4, 5]);
  assert.equal(a.startMin, 540);
  assert.equal(a.endMin, 1020);
  assert.equal(a.slot, 30);
  assert.deepEqual([...parseAvailability({ days: "sat-mon" }).days].sort(), [0, 1, 6]);
  assert.deepEqual([...parseAvailability({ days: "tue,thu" }).days].sort(), [2, 4]);
});

test("zonedToUtc: New York winter and summer, and the DST day", () => {
  assert.equal(new Date(zonedToUtc(2026, 1, 15, 9 * 60, "America/New_York")).toISOString(), "2026-01-15T14:00:00.000Z");
  assert.equal(new Date(zonedToUtc(2026, 7, 15, 9 * 60, "America/New_York")).toISOString(), "2026-07-15T13:00:00.000Z");
  assert.equal(new Date(zonedToUtc(2026, 3, 8, 12 * 60, "America/New_York")).toISOString(), "2026-03-08T16:00:00.000Z"); // after spring-forward
  assert.equal(new Date(zonedToUtc(2026, 3, 15, 9 * 60, "Asia/Kolkata")).toISOString(), "2026-03-15T03:30:00.000Z");
});

test("freeSlots: weekdays only, inside hours, notice, taken slots removed", () => {
  const a = parseAvailability({ days: "mon-fri", hours: "09:00-11:00", slot: "30", tz: "America/New_York" });
  // Friday Oct 2 2026, 10:00 New York = 14:00Z
  const now = Date.UTC(2026, 9, 2, 14, 0);
  const s = freeSlots(a, now, new Set(), 7);
  assert.ok(s.length > 0);
  assert.ok(s.every((x) => ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(x.day.slice(0, 3))));
  assert.ok(s.every((x) => new Date(x.iso).getTime() >= now + 120 * 60_000));
  assert.equal(s[0].iso, "2026-10-05T13:00:00.000Z"); // Monday 9:00 EDT; Friday's remaining slots are inside the 2 h notice
  assert.equal(s[0].label, "9:00 AM");
  assert.equal(s.filter((x) => x.iso.startsWith("2026-10-05")).length, 4); // 9:00, 9:30, 10:00, 10:30
  const taken = freeSlots(a, now, new Set(["2026-10-05T13:00:00.000Z"]), 7);
  assert.equal(taken.length, s.length - 1);
  assert.match(whenLabel("2026-10-05T13:00:00.000Z", "America/New_York"), /Monday, October 5 at 9:00 AM \(America\/New_York\)/);
});
