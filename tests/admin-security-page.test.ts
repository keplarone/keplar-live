import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** The admin security page: admin-only (404 to others), reads the event log, and never prints a raw address or account id. */
test("/admin/security is a server page gated by adminFromHeaders and shows hashed keys only", () => {
  const src = readFileSync("src/app/admin/security/page.tsx", "utf8");
  assert.match(src, /adminFromHeaders\(await headers\(\)\)/);
  assert.match(src, /if \(!admin\) notFound\(\)/);
  assert.match(src, /recentSecurityEvents\(/);
  assert.match(src, /e\.ipKey/);
  assert.match(src, /e\.acctKey/);
  assert.doesNotMatch(src, /\be\.ip\b|\be\.email\b|accountId/, "no raw identifiers are rendered");
  assert.match(src, /<th scope="col">/, "table headers carry scope for screen readers");
  assert.match(src, /<time dateTime=/, "times are machine-readable");
  assert.match(src, /aria-label=/, "the sparkline has a text equivalent");
  assert.match(src, /dynamic = "force-dynamic"/);
});
