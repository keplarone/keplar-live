import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// /app/create had no h1 at all (signed in or out): the Create tab bar and the site builder's h2s sat under nothing
// (axe page-has-heading-one). The page title is a visually hidden h1 so the visible layout is unchanged.
test("Create has a page-level h1", () => {
  assert.match(read("src/components/create/CreateStudio.tsx"), /<h1 className="visually-hidden">Create<\/h1>/);
});

// Signing in from the Create gate must return to Create (not Ask). After Site tab removal the gate lives on CreateStudio.
test("Create sign-in gate returns to Create", () => {
  const src = read("src/components/create/CreateStudio.tsx");
  assert.match(src, /SignInGate/);
  assert.match(src, /title="Sign in to create"/);
  assert.match(src, /next="\/app\/create"/);
  // the auth probe is /api/compute (200 with { signedIn } for everyone, so a signed-out visit logs no 401)
  assert.match(src, /fetch\("\/api\/compute"/);
  assert.match(src, /signedIn === false \? "out"/);
});

// Projects resume + template remix set keplar:create-site; Create must still open SiteBuilder for that handoff.
test("Create mounts SiteBuilder for site resume / remix handoff", () => {
  const src = read("src/components/create/CreateStudio.tsx");
  assert.match(src, /keplar:create-site/);
  assert.match(src, /SiteBuilder/);
  assert.match(src, /Back to Create/);
  assert.doesNotMatch(src, /tab\("site"/);
});
