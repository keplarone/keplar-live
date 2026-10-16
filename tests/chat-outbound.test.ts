import { test } from "node:test";
import assert from "node:assert/strict";
import { emailAction, eventAction, templateEmail } from "@/lib/business/chat-outbound";

const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
};

test("chat outbound: the email sent is exactly the one approved, to one valid recipient", () => {
  assert.deepEqual(emailAction({ to: " sam@acme.com ", subject: "Friday\r\nBcc: x@y.z", body: "Hi Sam" }), { type: "email.send", connector: "gmail", to: "sam@acme.com", subject: "Friday Bcc: x@y.z", body: "Hi Sam" });
  assert.equal(code(() => emailAction({ to: "Sam", subject: "s", body: "b" })), "bad_recipient");
  assert.equal(code(() => emailAction({ to: "a@b.com, c@d.com", subject: "s", body: "b" })), "bad_recipient");
  assert.equal(code(() => emailAction({ to: "a@b.com", subject: " ", body: "b" })), "no_subject");
  assert.equal(code(() => emailAction({ to: "a@b.com", subject: "s", body: "" })), "no_body");
});

test("chat outbound: events need a real start and end with an offset", () => {
  assert.deepEqual(eventAction({ title: "Meeting with Sam", start: "2026-10-16T15:00:00-04:00", end: "2026-10-16T15:30:00-04:00" }), { type: "gcal.event", connector: "gcal", title: "Meeting with Sam", description: "", start: "2026-10-16T15:00:00-04:00", end: "2026-10-16T15:30:00-04:00" });
  assert.equal(code(() => eventAction({ title: "x", start: "2026-10-16T15:00", end: "2026-10-16T15:30" })), "bad_time");
  assert.equal(code(() => eventAction({ title: "x", start: "2026-10-16T15:00:00Z", end: "2026-10-16T14:00:00Z" })), "bad_time");
  assert.equal(code(() => eventAction({ title: "", start: "2026-10-16T15:00:00Z", end: "2026-10-16T16:00:00Z" })), "no_title");
});

test("chat outbound: the starting draft is plain and invents nothing", () => {
  assert.deepEqual(templateEmail("Sam", "Friday"), { subject: "Friday", body: "Hi Sam,\n\nI wanted to reach out about Friday.\n\nThanks," });
  assert.equal(templateEmail("sam@acme.com", "to say thanks for the demo").subject, "Thanks for the demo");
  assert.ok(templateEmail("sam@acme.com", "x").body.startsWith("Hi,"));
  assert.ok(templateEmail("my landlord", "the leaky sink").body.startsWith("Hi Landlord,"));
});
