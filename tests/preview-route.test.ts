import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, signIn } from "./helpers/session";

test("draft preview: signed out is a 401 (not a 500 in the error log); another account's project is a 404", async () => {
  const { GET } = await import("@/app/sites/preview/[projectId]/[[...path]]/route");
  const ctx = { params: Promise.resolve({ projectId: "prj_nope", path: ["index.html"] }) };
  const anon = await GET(call(null, "/sites/preview/prj_nope/index.html"), ctx);
  assert.equal(anon.status, 401);
  const { cookie } = await signIn("preview-owner@example.com");
  const other = await GET(call(cookie, "/sites/preview/prj_nope/index.html"), ctx);
  assert.ok([403, 404].includes(other.status), String(other.status));
});
