import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { budget, glitchAt, nodePos, sample, scenePose, VARIANTS, variantFor, type VariantId } from "../src/field/monolith/math";

test("every variant has ordered keys from 0 to 1 and finite values", () => {
  for (const v of Object.values(VARIANTS)) {
    assert.ok(v.keys.length >= 2, v.id);
    assert.equal(v.keys[0].t, 0);
    assert.equal(v.keys[v.keys.length - 1].t, 1);
    for (let i = 1; i < v.keys.length; i++) assert.ok(v.keys[i].t > v.keys[i - 1].t, `${v.id} keys ascend`);
    for (const k of v.keys) for (const n of [...k.cam, ...k.look, k.s, k.rot, k.glow, k.beams, k.routes, k.nodes, k.net, k.ridge, k.agree, k.scan, k.ripple]) assert.ok(Number.isFinite(n));
  }
});

test("sampling hits the keys exactly and is continuous between them", () => {
  const keys = VARIANTS.home.keys;
  for (const k of keys) {
    const s = sample(keys, k.t);
    assert.ok(Math.abs(s.cam[0] - k.cam[0]) < 1e-9 && Math.abs(s.cam[2] - k.cam[2]) < 1e-9, `t=${k.t}`);
  }
  let prev = sample(keys, 0);
  for (let i = 1; i <= 600; i++) {
    const s = sample(keys, i / 600);
    const d = Math.hypot(s.cam[0] - prev.cam[0], s.cam[1] - prev.cam[1], s.cam[2] - prev.cam[2]);
    assert.ok(d < 0.6, `camera step ${d.toFixed(3)} at ${i / 600}`);
    prev = s;
  }
  assert.deepEqual(sample(keys, -1).cam, keys[0].cam);
  assert.deepEqual(sample(keys, 5).cam, keys[keys.length - 1].cam);
});

test("home story: seven keys (hero + six scenes), a glitch cut between each", () => {
  const h = VARIANTS.home;
  assert.equal(h.keys.length, 7);
  assert.equal(h.swaps.length, 6);
  for (const s of h.swaps) assert.ok(glitchAt(h.swaps, s) > 0.99);
  assert.ok(glitchAt(h.swaps, 0.0) < 0.01);
  assert.equal(glitchAt([], 0.5), 0);
});

test("routes appear in the Route scene, nodes agree in Compare, the scan runs in Verify", () => {
  const k = VARIANTS.home.keys;
  assert.equal(k[0].routes, 0);
  assert.equal(k[2].routes, 1);
  assert.equal(k[4].agree, 1);
  assert.equal(k[5].scan, 1);
  assert.ok(k[6].glow > k[0].glow);
});

test("nodes: spread on a ring, five cluster and one stands apart, all pulled into the monolith on convergence", () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ring = [0, 1, 2, 3, 4, 5].map((i) => nodePos(i, 0, 0, 0));
  const agree = [0, 1, 2, 3, 4, 5].map((i) => nodePos(i, 1, 0, 0));
  const spreadRing = Math.max(...[1, 2, 3, 4].map((i) => d(ring[0], ring[i])));
  const spreadAgree = Math.max(...[1, 2, 3, 4].map((i) => d(agree[0], agree[i])));
  assert.ok(spreadAgree < spreadRing, "five agree closer than the ring");
  assert.ok(d(agree[0], agree[5]) > 8, "the sixth stands apart");
  for (let i = 0; i < 6; i++) assert.ok(d(nodePos(i, 1, 1, 0), [0, 2, 0]) < 1e-9);
});

test("scene poses: one scene fully visible per act position, neighbours fly past", () => {
  for (let i = 0; i < 7; i++) {
    const vis = Array.from({ length: 7 }, (_, k) => scenePose(k - i).opacity);
    assert.equal(vis[i], 1);
    assert.equal(vis.filter((v) => v > 0.5).length, 1);
  }
  assert.ok(scenePose(0.8).scale < 1 && scenePose(-0.8).scale > 1);
});

test("every page family gets a variant; working screens get none", () => {
  const map: Record<string, VariantId | null> = {
    "/": null, "/overview": null, "/about": "ridge", "/how-it-works": "beams", "/models": "network", "/pricing": "network", "/blogs": "calm", "/docs/x": null, "/privacy": "calm",
    "/app": null, "/app/slides": null, "/app/create": null, "/create": null, "/admin/seo": null, "/account": null, "/sites/x": null,
  };
  for (const [p, v] of Object.entries(map)) assert.equal(variantFor(p), v, p);
  assert.ok(new Set(["/about", "/how-it-works", "/models", "/blogs"].map(variantFor)).size >= 4, "different scenes per family");
});

test("budgets shrink with quality and on phones; DPR is always capped", () => {
  assert.ok(budget("low", false).beams < budget("high", false).beams);
  assert.ok(budget("high", true).dust < budget("high", false).dust);
  for (const q of ["low", "medium", "high"] as const) for (const m of [false, true]) assert.ok(budget(q, m).dpr <= 1.6);
});

test("wiring: lazy three, pauses when hidden, DPR cap, grey-only, no scroll hijack, reduced motion and CPU-GL fall back", () => {
  const scene = readFileSync("src/field/monolith/scene.ts", "utf8");
  const gl = readFileSync("src/field/monolith/glsl.ts", "utf8");
  const canvas = readFileSync("src/components/monolith/MonolithCanvas.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const decor = readFileSync("src/components/chrome/LegacyDecor.tsx", "utf8");
  const chat = readFileSync("src/app/(chat)/page.tsx", "utf8");
  assert.ok(/document\.hidden/.test(scene) && /visibilitychange/.test(scene), "pauses when the tab is hidden");
  assert.ok(/dprCap/.test(scene) && /forceContextLoss/.test(scene));
  assert.ok(/import\("@\/field\/monolith\/scene"\)/.test(canvas), "page scene is lazy-loaded");
  assert.ok(/softwareRenderer\(\)/.test(canvas) && /reducedMotion/.test(canvas), "CPU rendering and reduced motion fall back");
  assert.ok(!/wheel|scrollTo|scrollBy|overflow:\s*hidden/.test(canvas), "never takes over scrolling");
  // The 3D layer mounts only inside Space Studio. The chat home does not.
  assert.ok(/<PageMonolith \/>/.test(decor) && /space-studio/.test(decor) && !/<PageMonolith \/>/.test(layout));
  assert.ok(!/SkyHome|MonolithHome|field\/monolith/.test(chat));
  // colour is limited to the four star families (and the planets); no neon accents in the monolith shaders
  assert.ok(!/cyan|indigo|violet|purple|magenta/i.test(gl + scene), "no neon accents in the scene");
  assert.ok(/SPECTRAL/.test(scene) && /aCol/.test(gl), "constellation stars use the spectral palette");
  // post pass is grey-only: the channels are never split
  assert.ok(!/\.r;\s*\n?.*\.b;/.test(gl.slice(gl.indexOf("POST_FRAG"))) && /vec3 col = vec3\(lum\)/.test(gl));
});

test("space layer: every key carries 0..1 weights, sampling interpolates them, budgets cover it, planets are chromatic", async () => {
  const { VARIANTS, sample, budget } = await import("../src/field/monolith/math");
  const parts = ["neb", "stars", "warp", "galaxy", "rings", "planet", "aurora", "mist"] as const;
  for (const v of Object.values(VARIANTS)) {
    for (const key of v.keys) for (const p of parts) assert.ok(key[p] >= 0 && key[p] <= 1, `${v.id} ${p}`);
    const a = sample(v.keys, 0), b = sample(v.keys, 1);
    const mid = sample(v.keys, 0.5);
    for (const p of parts) assert.ok(mid[p] >= Math.min(a[p], b[p]) - 1 && Number.isFinite(mid[p]));
  }
  assert.ok(VARIANTS.home.keys.some((k) => k.warp > 0.4) && VARIANTS.home.keys.some((k) => k.galaxy > 0.9) && VARIANTS.home.keys.some((k) => k.aurora > 0.9));
  for (const q of ["low", "medium", "high"] as const) {
    const d = budget(q, false), m = budget(q, true);
    assert.ok(m.stars < d.stars && m.galaxy < d.galaxy && d.oct >= 3);
    assert.ok(d.planetOct >= 3 && d.pathSeg >= 32 && d.planetFx >= 0);
    assert.ok(m.pathSeg <= d.pathSeg);
  }
  const fs = await import("node:fs");
  const spaceTs = fs.readFileSync(new URL("../src/field/monolith/space.ts", import.meta.url), "utf8");
  const spaceGl = fs.readFileSync(new URL("../src/field/monolith/space-glsl.ts", import.meta.url), "utf8");
  const src = spaceGl + spaceTs;
  assert.ok(/depthTest: false/.test(src) && /visible = /.test(src));
  for (const name of ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]) {
    assert.ok(spaceTs.includes(`name: "${name}"`), `missing planet ${name}`);
  }
  assert.ok(/uType/.test(spaceGl) && /uSunDir/.test(spaceGl) && /SATRING_FRAG/.test(spaceGl));
  assert.ok(/PATH_VERT/.test(spaceGl) && /SPARK_VERT/.test(spaceGl) && /SUN_VERT/.test(spaceGl));
  assert.ok(/gl_FragColor = vec4\(uInk/.test(spaceGl), "non-planet space shaders still write uInk");
  assert.ok(spaceTs.includes("ring:") && spaceTs.includes('name: "saturn"'), "Saturn keeps rings");
  assert.ok(/storyAt/.test(spaceTs) && /PATHS/.test(spaceTs), "story timeline drives the space layer");
});

test("story timeline: five caption beats, paths diverge then the strong ones hold", async () => {
  const { STORY_BEATS, beatAt, storyAt, PATHS, passAt } = await import("../src/field/monolith/story");
  assert.equal(STORY_BEATS.length, 5);
  assert.equal(PATHS.length, 6);
  assert.equal(beatAt(0), -1);
  assert.equal(beatAt(1), 0);
  assert.equal(beatAt(2.5), 1);
  assert.equal(beatAt(4), 2);
  assert.equal(beatAt(5), 3);
  assert.equal(beatAt(6), 4);
  const depths = PATHS.map((p, i) => -40 - i * 6);
  const open = storyAt(0.2, depths);
  assert.ok(open.spark < 0.05 && open.travel < 0.05);
  const minds = storyAt(2.5, depths);
  assert.ok(minds.travel > 0.5 && minds.paths.some((p) => p.draw > 0.5));
  const div = storyAt(4.0, depths);
  const ver = storyAt(5.0, depths);
  const dissent = PATHS.findIndex((p) => p.dissent);
  assert.ok(div.paths[dissent].bend > 0.5, "dissenter bends on disagreement");
  assert.ok(ver.paths[dissent].alpha < div.paths[dissent].alpha, "weak path fades on verify");
  const strong = PATHS.findIndex((p) => p.strength >= 0.9);
  assert.ok(ver.paths[strong].boost > 0.3, "strong path brightens on verify");
  const end = storyAt(6, depths);
  assert.ok(end.answer > 0.8 && end.earth > 0.8 && end.converge > 0.8);
  assert.ok(passAt(-52) > 0.4 && passAt(-52) < 0.7);
});

test("logo: the real Keplar mark, extruded + bevelled, one non-indexed geometry (one draw call), low poly", async () => {
  const { logoGeometry } = await import("../src/field/monolith/logo");
  for (const d of ["high", "low"] as const) {
    const g = logoGeometry(2.5, d);
    assert.equal(g.index, null);
    const pos = g.getAttribute("position"), nrm = g.getAttribute("normal");
    assert.ok(pos && nrm && pos.count === nrm.count && pos.count % 3 === 0);
    const tris = pos.count / 3;
    assert.ok(tris < (d === "high" ? 16000 : 5000), `${d}: ${tris} triangles`);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    assert.ok(Math.abs(bb.max.x - bb.min.x - 2.5) < 0.1, "scaled to width (plus the bevel)");
    assert.ok(Math.abs(bb.max.x + bb.min.x) < 0.05 && Math.abs(bb.max.y + bb.min.y) < 0.05, "centred");
    g.dispose();
  }
  // smooth shading: on the front cap, normals vary continuously into the bevel (no flat facets): many distinct normal directions
  const g = logoGeometry(2.5, "high"), n = g.getAttribute("normal");
  const dirs = new Set<string>();
  for (let i = 0; i < n.count; i++) dirs.add(`${n.getX(i).toFixed(2)},${n.getY(i).toFixed(2)},${n.getZ(i).toFixed(2)}`);
  assert.ok(dirs.size > 600, `creased smooth normals (${dirs.size} directions)`);
  g.dispose();
  const logoSrc = readFileSync("src/field/monolith/logo.ts", "utf8");
  assert.ok(/toCreasedNormals/.test(logoSrc), "normals smoothed with a crease angle");
  const scene = readFileSync("src/field/monolith/scene.ts", "utf8");
  assert.ok(/logoGeometry\(/.test(scene) && /LOGO_FRAG/.test(scene));
  assert.ok(!/BoxGeometry|EdgesGeometry|GLASS_FRAG|CORE_FRAG|HALO_FRAG/.test(scene), "the old glass monolith and blob are gone");
  assert.ok(/KeplarSymbol/.test(readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8")), "the chat shows the static mark");
});

test("chapters: seven documented chapters, valid motifs, static under reduced motion, a DOM watcher and a scene API", async () => {
  const ch = await import("../src/field/monolith/chapters");
  assert.deepEqual([...ch.CHAPTER_IDS], ["ask", "understand", "create", "together", "ship", "platform", "trust"]);
  for (const id of ch.CHAPTER_IDS) {
    const m = ch.MOTIFS[id];
    assert.equal(m.id, id);
    assert.ok(m.pts.length > 3 && m.pts.length <= 72 && m.lines.length <= 72, `${id} fits the layer buffers`);
    for (const [x, y, c, s] of m.pts) assert.ok(Math.abs(x) <= 4.2 && Math.abs(y) <= 2.8 && c >= 0 && c <= 3 && s > 0, `${id} point in plane`);
    for (const [a, b] of m.lines) assert.ok(a < m.pts.length && b < m.pts.length && a !== b, `${id} line`);
    for (const l of m.lights) for (const i of l.path) assert.ok(i < m.pts.length);
    const still = ch.chapterState(id, null, 0, true);
    assert.deepEqual(still, { draw: 1, resolve: 1, correct: 1, launch: 1, arrive: 1 });
    const early = ch.chapterState(id, 0, 0);
    assert.equal(early.draw, 0);
  }
  assert.ok(ch.MOTIFS.together.fix && ch.MOTIFS.together.lights.length === 2, "two cursor-lights + a critic correction");
  assert.ok(ch.MOTIFS.ship.launch && ch.chapterState("ship", 1, 0).arrive === 1, "the launch reaches the far star by the end of the section");
  assert.ok(ch.MOTIFS.create.resolves && ch.chapterState("create", 0.9, 3).resolve === 1);
  assert.equal(ch.isChapter("ship"), true); assert.equal(ch.isChapter("nope"), false);
  assert.equal(typeof ch.watchChapters, "function");
  const scene = readFileSync("src/field/monolith/scene.ts", "utf8");
  assert.ok(/setChapter\(id: ChapterId \| null, progress/.test(scene) && /export \{ SPECTRAL, watchChapters/.test(scene));
  const doc = readFileSync("src/field/monolith/CHAPTERS.md", "utf8");
  for (const id of ch.CHAPTER_IDS) assert.ok(doc.includes(`"${id}"`), `CHAPTERS.md documents ${id}`);
  assert.ok(/data-chapter/.test(doc) && /keplar:chapter/.test(doc) && /setChapter/.test(doc));
});

test("planets never change size on hover (no hover zoom / grow anywhere)", () => {
  const space = readFileSync("src/field/monolith/space.ts", "utf8");
  assert.ok(/const scale = p\.r;/.test(space), "planet scale is constant");
  assert.ok(!/focused \* 0\.28|focused \* 4|bestD/.test(space), "no pointer-driven focus scale or dolly");
});

test("home is the chat: a real greeting, no three.js scene, no scroll hijack", () => {
  const home = readFileSync("src/components/app-ui/ChatHome.tsx", "utf8");
  const scene = readFileSync("src/field/words/scene.ts", "utf8");
  const gl = readFileSync("src/field/words/glsl.ts", "utf8");
  const phrases = readFileSync("src/field/words/glyphs.ts", "utf8");
  assert.match(home, /How can Keplar help you today\?/);
  assert.doesNotMatch(home, /field\/monolith|field\/words|SkyHome|MonolithHome|three/);
  assert.doesNotMatch(home, /wheel|scrollTo|scrollBy/);
  assert.ok(/document\.hidden/.test(scene) && /visibilitychange/.test(scene) && /dprCap/.test(scene) && /forceContextLoss/.test(scene));
  assert.ok(/PHRASES\[0\]/.test(scene) && /KEPLAR/.test(phrases) && /ONE ANSWER/.test(phrases));
  assert.ok(!/cyan|indigo|violet|purple|magenta/i.test(gl + scene));
});

test("the monolith post pass stays clean", () => {
  const gl = readFileSync("src/field/monolith/glsl.ts", "utf8");
  const scene = readFileSync("src/field/monolith/scene.ts", "utf8");
  const post = gl.slice(gl.indexOf("POST_FRAG"), gl.indexOf("LOGO_VERT"));
  assert.ok(!/sin\(uv\.y \* uRes\.y/.test(post) && !/uv\.x \* 10\.0/.test(post) && !/floor\(uv\.y \* 28\.0\)/.test(post), "no scan lines, vertical stripes or torn row slices");
  assert.ok(/samples: this\.o\.mobile \? 0 : 4/.test(scene) && !/vel \* 0\.35/.test(scene), "smooth logo through a cut, no scroll-speed glitch");
  assert.ok(/this\.o\.still && changed/.test(scene), "still mode redraws only when the chapter changes");
  assert.ok(/e !== document\.documentElement && e !== document\.body/.test(readFileSync("src/field/monolith/chapters.ts", "utf8")), "page-level data-chapter mirrors are not sections");
});
