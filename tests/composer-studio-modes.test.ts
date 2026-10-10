import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { studioOf, toggleMode } from "../src/lib/composer/modes";
import { deckRequestFrom, slidesCountFrom } from "../src/lib/slides/from-chat";
import { studyGuideFrom } from "../src/lib/study/from-chat";
import { PALETTES } from "../src/lib/slides/themes";

const base = { web: true, deepResearch: false, debate: false, create: false, image: false, agent: false };

test("study / slides chips are exclusive with every other kind of run; web is left alone", () => {
  let m = toggleMode({ ...base, debate: true }, "study");
  assert.equal(m.study, true);
  assert.equal(m.debate, false);
  assert.equal(m.web, true);
  m = toggleMode(m, "slides");
  assert.equal(m.slides, true);
  assert.equal(m.study, false);
  m = toggleMode(m, "agent");
  assert.equal(m.agent, true);
  assert.equal(m.slides, false);
  m = toggleMode(toggleMode(m, "deepResearch"), "debate");
  assert.equal(m.debate, true);
  assert.equal(m.deepResearch, false);
  assert.equal(toggleMode({ ...base, study: true }, "study").study, false);
  assert.equal(studioOf({ ...base, slides: true }), "slides");
  assert.equal(studioOf(base), null);
});

test("a chat message becomes a real deck request within the API limits", () => {
  assert.equal(slidesCountFrom("a 6-slide pitch deck", 15), 6);
  assert.equal(slidesCountFrom("make 40 slides", 15), 15);
  assert.equal(slidesCountFrom("deck on bread", 15), 8);
  const short = deckRequestFrom("Rise & Crumb pitch deck", 15);
  assert.deepEqual(short, { topic: "Rise & Crumb pitch deck", outline: "", count: 8 });
  const long = deckRequestFrom(`Pitch deck for a bakery. ${"Cover the market, the team and the numbers. ".repeat(10)}`, 15);
  assert.equal(long.topic, "Pitch deck for a bakery.");
  assert.ok(long.outline.length > 200);
});

test("the study guide is the attached material, else the question plus Keplar's own answer (nothing invented)", () => {
  assert.equal(studyGuideFrom("q", "answer", [{ name: "a.txt", text: "notes" }]).source, "documents");
  const g = studyGuideFrom("What is photosynthesis?", "Plants turn light into sugar.");
  assert.equal(g.source, "answer");
  assert.equal(g.text, "Question: What is photosynthesis?\n\nPlants turn light into sugar.");
});

test("slide themes and debate seats carry no blue or purple", () => {
  const hue = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.08) return null; // grey
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (const [name, t] of Object.entries(PALETTES)) {
    for (const [k, v] of Object.entries(t)) {
      const h = hue(v);
      assert.ok(h === null || h < 180 || h > 320, `${name}.${k} #${v} is blue/purple`);
    }
  }
  const css = readFileSync(new URL("../src/components/app-ui/DebateView.module.css", import.meta.url), "utf8");
  for (const m of css.matchAll(/--seat: #([0-9a-f]{6})/gi)) assert.equal(hue(m[1]), null, `seat #${m[1]} should be grey`);
});
