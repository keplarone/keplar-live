import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The screen-reader hint only promises "/" commands when they actually work (Create image on).
test("composer hint: '/ for image slash commands' only when Create image is on", () => {
  const src = readFileSync(new URL("../src/components/app-ui/Composer.tsx", import.meta.url), "utf8");
  const hint = src.split("\n").find((l) => l.includes("-hint`} className=\"visually-hidden\""));
  assert.ok(hint, "hint paragraph found");
  assert.match(hint!, /modes\.image \? "Type \/ for image slash commands\. "/);
  assert.match(hint!, /Turn on Create image to use \/ image commands\./);
});
