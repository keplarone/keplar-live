import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENE_IDS, SCROLL_MOTION, buildScene } from "@/field/scenes";
import { profileFor, sceneForPath } from "@/field/profile";

test("every scene builds finite buffers of exactly the asked size, and has its own scroll move", () => {
  for (const id of SCENE_IDS) {
    const d = buildScene(id, 600, { hw: 9, hh: 5 });
    assert.equal(d.P.length, 1800, id);
    assert.ok([...d.P, ...d.C, ...d.M, ...d.S].every(Number.isFinite), `${id}: finite`);
    assert.ok(SCROLL_MOTION[id], `${id}: has a scroll-driven camera move`);
  }
  // the marketing scenes move differently from each other (no two share the same camera travel)
  const marketing = SCENE_IDS.filter((id) => !id.startsWith("onb-"));
  const moves = marketing.map((id) => SCROLL_MOTION[id].join(","));
  assert.equal(new Set(moves).size, marketing.length, "each scene travels differently while scrolling");
});

test("different pages show different scenes: every marketing family maps to its own formation", () => {
  const pages: Record<string, string> = {
    "/about": "helix", "/docs": "sheets", "/docs/getting-started": "sheets", "/blogs": "ribbons", "/models": "globe", "/vs": "split", "/compare/a-vs-b": "split",
    "/superintelligence": "torus", "/glossary": "rain", "/prompts/code": "rain", "/signin": "gate", "/checkout": "gate", "/feedback": "echo", "/inquire": "echo",
    "/privacy": "vault", "/terms": "vault", "/use-cases/x": "spiral", "/for-developers": "tunnel", "/pricing": "pricing", "/download": "download",
    "/account": "memory", "/agents": "agents", "/enterprise": "business", "/for-students": "create", "/how-it-works": "converge",
  };
  for (const [path, scene] of Object.entries(pages)) assert.equal(sceneForPath(path), scene, path);
  const families = new Set(Object.values(pages));
  assert.ok(families.size >= 18, `${families.size} distinct formations across the marketing site`);
  assert.equal(profileFor("/"), null, "home keeps its own scroll-linked field");
  assert.equal(profileFor("/about")?.scene, "helix");
});

test("the scene engine, host, worker and page layer all carry the scroll progress (and a reduced-motion user gets a still camera)", async () => {
  const { readFileSync } = await import("node:fs");
  const eng = readFileSync("src/field/scene-engine.ts", "utf8");
  assert.match(eng, /setScroll\(p: number\)/);
  assert.match(eng, /SCROLL_MOTION\[this\.sceneId\]/);
  assert.match(eng, /this\.calm \? 0 : this\.scrollTarget/);
  assert.match(readFileSync("src/field/host.ts", "utf8"), /setScroll: \(p\) => post\(\{ t: "scroll", p \}\)/);
  assert.match(readFileSync("src/field/field.worker.ts", "utf8"), /case "scroll"/);
  assert.match(readFileSync("src/components/field/PageField.tsx", "utf8"), /addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
});
