import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORM_HTML, CAPTCHA_HTML } from "@/lib/wants/fixtures";
import { captchaFixtureUrl, formFixtureUrl, runFormTask, urlAllowed } from "@/lib/wants/browser";
import { scriptedPage } from "./helpers/wants-page";

const FORM = "file:///tmp/keplar-wants-fixture/form.html";

test("Track B refuses real sites and will not submit without a confirmed PIN", async () => {
  assert.equal(urlAllowed("https://www.amazon.com"), false);
  assert.equal(urlAllowed(FORM), true);
  assert.equal(urlAllowed(formFixtureUrl()), true);
  assert.equal(urlAllowed(captchaFixtureUrl()), true);
  // IN-8 (docs/rebirth/AUDIT.md): any file: URL used to pass, so a target could read files on the server.
  for (const bad of ["file:///etc/passwd", "file:///tmp/form.html", "file:///tmp/keplar-wants-x/../../etc/passwd", "file:///tmp/keplar-wants-x/secret.html", "file:///var/keplar-wants-x/form.html", "file://host/tmp/keplar-wants-x/form.html", "file:///tmp/keplar-wants-x/sub/form.html"]) assert.equal(urlAllowed(bad), false, bad);
  assert.equal(urlAllowed("http://127.0.0.1:9/form"), true);
  assert.equal(urlAllowed("http://localhost/form"), true);
  const opened = { n: 0 };
  const open = async () => {
    opened.n++;
    throw new Error("should not launch");
  };
  assert.equal((await runFormTask({ userId: "u1", url: "https://www.amazon.com", fields: {}, submitSelector: null, open })).status, "refused");
  assert.equal((await runFormTask({ userId: "u1", url: FORM, fields: {}, submitSelector: "#submit", dryRun: false, open })).status, "needs_confirmation");
  assert.equal(opened.n, 0);
});

test("dry-run fills and does not click submit; a confirmed run does", async () => {
  const dry = scriptedPage(FORM_HTML);
  const filled = await runFormTask({ userId: "u1", url: FORM, fields: { "#item": "pizza" }, submitSelector: "#submit", open: dry.open });
  assert.equal(filled.status, "dry_run");
  assert.equal("submitted" in filled && filled.submitted, false);
  assert.deepEqual(dry.fills, [["#item", "pizza"]]);
  assert.deepEqual(dry.clicks, []);
  assert.equal(dry.wasClosed(), true);

  const go = scriptedPage(FORM_HTML);
  const submitted = await runFormTask({ userId: "u1", url: FORM, fields: { "#item": "pizza" }, submitSelector: "#submit", dryRun: false, confirmed: true, open: go.open });
  assert.equal(submitted.status, "submitted");
  assert.equal("submitted" in submitted && submitted.submitted, true);
  assert.equal("result" in submitted && submitted.result, "ok:pizza");
  assert.deepEqual(go.clicks, ["#submit"]);
});

test("a missing selector or a driver error becomes a fallback card and the page is closed", async () => {
  const gone = scriptedPage(FORM_HTML);
  const r = await runFormTask({ userId: "u1", url: FORM, fields: { "#gone": "x" }, submitSelector: "#submit", timeoutMs: 1500, open: gone.open });
  assert.equal(r.status, "fallback");
  assert.equal(r.status === "fallback" && r.ui.type, "fallback_modal");
  assert.equal(r.status === "fallback" && r.reason, "driver_or_dom_error");
  assert.equal(gone.wasClosed(), true);
});

test("captcha and password pages are refused", async () => {
  const cap = scriptedPage(CAPTCHA_HTML);
  assert.equal((await runFormTask({ userId: "u1", url: captchaFixtureUrl(), fields: { "#item": "x" }, submitSelector: null, open: cap.open })).status, "refused");
  const pw = scriptedPage(`<input id="item" type="password">`);
  assert.equal((await runFormTask({ userId: "u1", url: FORM, fields: { "#item": "x" }, submitSelector: null, open: pw.open })).status, "refused");
  assert.equal(cap.wasClosed(), true);
  assert.equal(pw.wasClosed(), true);
});

test("real Chromium: dry-run, confirmed submit, captcha refusal, and a DOM-shift fallback on local fixtures only", async () => {
  const dry = await runFormTask({ userId: "u1", url: formFixtureUrl(), fields: { "#item": "pizza" }, submitSelector: "#submit", timeoutMs: 8000 });
  assert.equal(dry.status, "dry_run", JSON.stringify(dry));
  assert.equal("submitted" in dry && dry.submitted, false);

  const submitted = await runFormTask({ userId: "u1", url: formFixtureUrl(), fields: { "#item": "pizza" }, submitSelector: "#submit", dryRun: false, confirmed: true, timeoutMs: 8000 });
  assert.equal(submitted.status, "submitted", JSON.stringify(submitted));
  assert.equal("result" in submitted && submitted.result?.trim(), "ok:pizza");

  const cap = await runFormTask({ userId: "u1", url: captchaFixtureUrl(), fields: { "#item": "x" }, submitSelector: null, timeoutMs: 8000 });
  assert.equal(cap.status, "refused", JSON.stringify(cap));

  const gone = await runFormTask({ userId: "u1", url: formFixtureUrl(), fields: { "#gone": "x" }, submitSelector: "#submit", timeoutMs: 1500 });
  assert.equal(gone.status, "fallback", JSON.stringify(gone));
  assert.equal(gone.status === "fallback" && gone.ui.type, "fallback_modal");
});
