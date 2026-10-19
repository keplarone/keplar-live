import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { joinLines, splitLines } from "../src/lib/md-lines";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("a haiku keeps its three lines (hard-break spaces and backslashes dropped)", () => {
  // the exact shape a free model sent on keplar.one: CommonMark hard breaks (two trailing spaces)
  const md = ["Soft pages whisper,  ", "Sunlight pools on wooden floors—  ", "Silence holds its breath."];
  assert.equal(joinLines(md), "Soft pages whisper,\nSunlight pools on wooden floors—\nSilence holds its breath.");
  assert.deepEqual(splitLines(joinLines(md)), ["Soft pages whisper,", "Sunlight pools on wooden floors—", "Silence holds its breath."]);
  assert.equal(joinLines(["Line one\\", "Line two"]), "Line one\nLine two");
  assert.equal(joinLines(["  indented", "plain line"]), "indented\nplain line");
  // an escaped backslash at the end of a line is text, not a hard break
  assert.equal(joinLines(["path C:\\\\", "next"]), "path C:\\\\\nnext");
  assert.equal(joinLines(["One line only."]), "One line only.");
});

test("the answer renderer keeps lines in paragraphs and quotes and draws <br> between them", () => {
  const src = read("src/components/app-ui/Markdown.tsx");
  const grammar = read("src/components/app-ui/markdown-parse.ts");
  assert.match(grammar, /t: "p", text: joinLines\(para\)/);
  assert.match(grammar, /t: "quote", text: joinLines\(body\)/);
  assert.doesNotMatch(grammar, /para\.join\(" "\)/);
  assert.match(src, /<br key=/);
});
