import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SLASH_COMMANDS,
  activeSlashToken,
  expandPromptIfSlash,
  expandSlashCommand,
  filterSlashCommands,
  parseLeadingSlash,
  slashCommandById,
} from "@/lib/images/slash-commands";

test("catalog ships the Instagram-style set plus useful extras", () => {
  const ids = SLASH_COMMANDS.map((c) => c.id);
  for (const need of ["bts", "adcreative", "explodeview", "impossibleangle", "surreal", "cinematic", "productshot", "sketch", "macro", "night"]) {
    assert.ok(ids.includes(need), need);
  }
  assert.ok(SLASH_COMMANDS.length >= 10);
});

test("activeSlashToken finds / partials at the caret", () => {
  assert.deepEqual(activeSlashToken("/BT", 3), { start: 0, end: 3, query: "/BT" });
  assert.deepEqual(activeSlashToken("hello /Ad", 9), { start: 6, end: 9, query: "/Ad" });
  assert.equal(activeSlashToken("price is 5/10", 13), null);
  assert.equal(activeSlashToken("email me/now", 12), null);
  assert.deepEqual(activeSlashToken("/\n", 1), { start: 0, end: 1, query: "/" });
});

test("filterSlashCommands matches id, label and summary", () => {
  assert.equal(filterSlashCommands("/").length, SLASH_COMMANDS.length);
  assert.deepEqual(filterSlashCommands("/BT").map((c) => c.id), ["bts"]);
  assert.ok(filterSlashCommands("/ad").some((c) => c.id === "adcreative"));
  assert.ok(filterSlashCommands("/exploded").some((c) => c.id === "explodeview") || filterSlashCommands("explode").some((c) => c.id === "explodeview"));
  assert.ok(filterSlashCommands("neon").some((c) => c.id === "night") || filterSlashCommands("/Night").some((c) => c.id === "night"));
});

test("parseLeadingSlash is case-insensitive and keeps following subject text", () => {
  const p = parseLeadingSlash("/BTS red sneaker");
  assert.equal(p?.command.id, "bts");
  assert.equal(p?.subject, "red sneaker");
  assert.equal(parseLeadingSlash("/adcreative")?.command.id, "adcreative");
  assert.equal(parseLeadingSlash("/unknown thing"), null);
  assert.equal(parseLeadingSlash("draw a fox"), null);
});

test("expand preserves subject from following text or from a reference", () => {
  const bts = slashCommandById("bts")!;
  const withText = expandSlashCommand(bts, "a red sneaker", false);
  assert.match(withText, /red sneaker/i);
  assert.match(withText, /Behind-the-scenes|production/i);
  assert.doesNotMatch(withText, /attached reference/i);

  const withRef = expandSlashCommand(bts, "", true);
  assert.match(withRef, /attached reference/i);
  assert.match(withRef, /Preserve the exact subject/i);

  const textOnly = expandPromptIfSlash("/Surreal a glass tower", { hasReference: false });
  assert.equal(textOnly.command?.id, "surreal");
  assert.match(textOnly.prompt, /glass tower/);
  assert.doesNotMatch(textOnly.prompt, /^\/Surreal/);

  const passthrough = expandPromptIfSlash("a lighthouse in fog");
  assert.equal(passthrough.command, null);
  assert.equal(passthrough.prompt, "a lighthouse in fog");
});

test("US spelling in templates (no colour/favour/centre)", () => {
  for (const c of SLASH_COMMANDS) {
    const t = c.build({ subject: "the subject", hasReference: false });
    assert.doesNotMatch(t, /\bcolour|\bfavour|\bcentre|\bbehaviour|\borganis/i, c.slash);
  }
});

test("filterSlashCommands puts name-prefix matches first (so /ma + Enter picks /Macro)", () => {
  assert.equal(filterSlashCommands("/ma")[0]?.id, "macro");
  assert.equal(filterSlashCommands("/p")[0]?.id.startsWith("p"), true);
  assert.equal(filterSlashCommands("/s")[0]?.id.startsWith("s"), true);
  // summary-only matches are still listed, after the name matches
  assert.ok(filterSlashCommands("/ma").length > 1);
  // order with no query is the catalog order
  assert.deepEqual(filterSlashCommands("/").map((c) => c.id), SLASH_COMMANDS.map((c) => c.id));
});
