import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHref } from "@/lib/safe-href";

test("markdown links: web, mail and same-site paths pass; script, data and protocol-relative targets do not", () => {
  for (const ok of ["https://example.com/a", "http://example.com", "mailto:a@b.co", "/pricing", "/a/b?x=1#y"]) assert.equal(safeHref(ok), true, ok);
  for (const bad of [
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "evil.example",
    "",
    undefined,
    null,
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "https://example.com/\u0000",
    "https://example.com/\n",
  ]) assert.equal(safeHref(bad as string), false, String(bad));
});
