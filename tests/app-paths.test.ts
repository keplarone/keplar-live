import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_HOME, VIEW_PATH, pathForView, viewForPath, isAppPath } from "@/components/app-ui/app-paths";
import type { View } from "@/components/app-ui/state/types";

test("Ask is the site root; every other view keeps a unique /app/… path", () => {
  assert.equal(APP_HOME, "/");
  assert.equal(pathForView("thread"), "/");
  assert.equal(pathForView("create"), "/app/create");
  const paths = Object.values(VIEW_PATH);
  assert.equal(new Set(paths).size, paths.length);
  for (const [view, p] of Object.entries(VIEW_PATH)) {
    if (view === "thread") assert.equal(p, "/");
    else assert.match(p, /^\/app\/[a-z]+$/);
  }
});

test("viewForPath is the inverse of pathForView, and bare /app means Ask", () => {
  for (const v of Object.keys(VIEW_PATH) as View[]) assert.equal(viewForPath(pathForView(v)), v);
  assert.equal(viewForPath("/app"), "thread");
  assert.equal(viewForPath("/app/"), "thread");
  assert.equal(viewForPath("/app/ask/"), "thread");
  assert.equal(viewForPath("/"), "thread");
  assert.equal(viewForPath("/pricing"), null);
  assert.equal(viewForPath("/app/unknown"), null);
});

test("isAppPath covers the shell routes only", () => {
  assert.equal(isAppPath("/"), true);
  assert.equal(isAppPath("/app"), true);
  assert.equal(isAppPath("/app/ask"), true);
  assert.equal(isAppPath("/account"), false);
  assert.equal(isAppPath("/overview"), false);
});
