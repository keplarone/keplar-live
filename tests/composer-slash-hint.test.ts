import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The composer offers chat slash commands. Image slash commands are not in the menu.
test("composer hint offers chat slash commands and not image slash commands", () => {
  const src = readFileSync(new URL("../src/components/app-ui/Composer.tsx", import.meta.url), "utf8");
  const hint = src.split("\n").find((l) => l.includes("-hint`} className=\"visually-hidden\""));
  assert.ok(hint, "hint paragraph found");
  assert.match(hint!, /Type \/ for chat commands such as \/slides, \/quiz and \/approvals\./);
  assert.doesNotMatch(hint!, /image slash|Create image/);
  assert.doesNotMatch(src, /label: "Create image"/);
  assert.doesNotMatch(src, /filterSlashCommands/);
});
