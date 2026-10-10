import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { askFromMarks, markBounds, markLabel } from "../src/components/desktop/draw";

test("a drawing becomes a question about the words under each shape", () => {
  assert.equal(markLabel("rect"), "Rectangle");
  assert.equal(markLabel("pen"), "Freehand stroke");
  const box = markBounds({ kind: "rect", a: { x: 10, y: 20 }, b: { x: 40, y: 50 } });
  assert.deepEqual(box, { left: 10, top: 20, width: 30, height: 30 });
  const q = askFromMarks([{ kind: "ellipse", words: "Harbor notes" }, { kind: "arrow", words: "" }]);
  assert.match(q, /Ellipse over: Harbor notes/);
  assert.match(q, /Arrow over: no readable words/);
  assert.ok(!q.includes("data:image"));
});

test("desktop extras: stats only for pro and above, chat and draw stay on the page, no emails", () => {
  const src = readFileSync("src/components/desktop/DesktopDock.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /<DesktopDock \/>/);
  assert.match(src, /d\?\.plan === "pro" \|\| d\?\.plan === "business"/);
  assert.match(src, /Ask about this/);
  assert.match(src, /revenue\?\.last30/);
  assert.doesNotMatch(src, /\.email|recent\[/);
  assert.match(src, /rate == null \? "—"/);
  assert.match(src, /min-width: 1100px|useWideDesktop/);
});
