import { test } from "node:test";
import assert from "node:assert/strict";
import { whenFrom, withoutWhen } from "@/lib/chat-actions/when";
import { calendarTemplateUrl, dateTile, eventTimes, gmailComposeUrl, isAddress, offsetText, timeRange } from "@/lib/chat-actions/outbound-view";

const THU = "2026-10-15";

test("when: days, times and lengths are read from the words, nothing more", () => {
  assert.deepEqual(whenFrom("on Friday", THU), { date: "2026-10-16", words: "on Friday" });
  assert.deepEqual(whenFrom("tomorrow at 3pm", THU), { date: "2026-10-16", time: "15:00", words: "tomorrow at 3pm" });
  assert.equal(whenFrom("Thursday", THU)?.date, "2026-10-22"); // today's own weekday means next week's
  assert.equal(whenFrom("this Thursday", THU)?.date, "2026-10-15");
  assert.equal(whenFrom("on Oct 23", THU)?.date, "2026-10-23");
  assert.equal(whenFrom("on March 2", THU)?.date, "2027-03-02"); // a passed date is next year's
  assert.equal(whenFrom("Feb 30", THU), null);
  assert.equal(whenFrom("at 10:30", THU)?.time, "10:30");
  assert.equal(whenFrom("at noon", THU)?.time, "12:00");
  assert.equal(whenFrom("at 3", THU)?.time, "15:00");
  assert.equal(whenFrom("at 9", THU)?.time, "09:00");
  assert.equal(whenFrom("12am", THU)?.time, "00:00");
  assert.equal(whenFrom("for an hour", THU)?.minutes, 60);
  assert.equal(whenFrom("for 1.5 hours", THU)?.minutes, 90);
  assert.equal(whenFrom("with Sam", THU), null);
  assert.equal(withoutWhen(" with Sam on Friday at 3pm"), "with Sam");
});

test("outbound view: event times carry the person's offset, and fallbacks open Google's own pages", () => {
  assert.equal(offsetText(-240), "-04:00");
  assert.equal(offsetText(330), "+05:30");
  assert.equal(offsetText(-270), "-04:30");
  assert.deepEqual(eventTimes("2026-10-16", "15:00", 30, () => -240), { start: "2026-10-16T15:00:00-04:00", end: "2026-10-16T15:30:00-04:00" });
  assert.equal(eventTimes("2026-10-16", "23:30", 60, () => 0)?.end, "2026-10-17T00:30:00+00:00");
  assert.equal(eventTimes("", "15:00", 30), null);
  assert.equal(eventTimes("2026-10-16", "", 30), null);
  assert.deepEqual(dateTile("2026-10-16"), { month: "Oct", day: "16", weekday: "Friday" });
  assert.equal(timeRange("15:00", 30), "3:00 PM – 3:30 PM");
  assert.equal(timeRange("00:15", undefined), "12:15 AM");
  assert.ok(isAddress("sam@acme.com"));
  assert.ok(!isAddress("Sam"));
  assert.ok(!isAddress("a@b.com, c@d.com"));
  const g = new URL(gmailComposeUrl("sam@acme.com", "Friday", "Hi Sam"));
  assert.equal(g.hostname, "mail.google.com");
  assert.equal(g.searchParams.get("to"), "sam@acme.com");
  assert.equal(g.searchParams.get("su"), "Friday");
  const c = new URL(calendarTemplateUrl("Meeting with Sam", "2026-10-16", "15:00", 30)!);
  assert.equal(c.searchParams.get("dates"), "20261016T150000/20261016T153000");
  assert.equal(calendarTemplateUrl("x", "", "15:00", 30), null);
});
