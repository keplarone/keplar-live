import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_HOME, VIEW_PATH, pathForView, viewForPath, isAppPath } from "@/components/app-ui/app-paths";
import type { View } from "@/components/app-ui/state/types";

test("every View has a unique path; Ask is the site root", () => {
  assert.equal(APP_HOME, "/");
  assert.equal(pathForView("thread"), "/");
  assert.equal(pathForView("create"), "/app/create");
  const paths = Object.values(VIEW_PATH);
  assert.equal(new Set(paths).size, paths.length);
  for (const p of paths) assert.match(p, p === "/" ? /^\/$/ : /^\/app\/[a-z]+$/);
});

test("viewForPath is the inverse of pathForView, and / and /app mean Ask", () => {
  for (const v of Object.keys(VIEW_PATH) as View[]) assert.equal(viewForPath(pathForView(v)), v);
  assert.equal(viewForPath("/"), "thread");
  assert.equal(viewForPath("/app"), "thread");
  assert.equal(viewForPath("/app/"), "thread");
  assert.equal(viewForPath("/app/ask/"), "thread");
  assert.equal(viewForPath("/overview"), null);
  assert.equal(viewForPath("/pricing"), null);
  assert.equal(viewForPath("/app/unknown"), null);
});

test("isAppPath covers the shell routes only", () => {
  assert.equal(isAppPath("/"), true);
  assert.equal(isAppPath("/app"), true);
  assert.equal(isAppPath("/app/ask"), true);
  assert.equal(isAppPath("/overview"), false);
  assert.equal(isAppPath("/account"), false);
});
