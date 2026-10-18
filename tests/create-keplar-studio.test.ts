import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSearch,
  DEFAULT_STUDIO_ENV,
  locationFromUrl,
  pickEnv,
  readRememberedEnv,
  rememberEnv,
  resolveCreateLocation,
  STUDIO_ENV_KEY,
  STUDIO_ENVS,
  studioEnvLabel,
  studioHref,
  studioRequested,
} from "../src/components/create/studio/keplar-studio-nav";
import { ALL_FEATURES, CHAPTERS, KEPLAR_STUDIO, PRODUCTS, productFeatures } from "../src/lib/features";
import { landingBySlug } from "../src/lib/content/landing";
import { STUDIO_PLANS } from "../src/lib/desktop/studio-bridge";

const read = (p: string) => readFileSync(p, "utf8");

test("Create links: legacy roblox/blender tabs and the canonical studio form land on Keplar Studio", () => {
  assert.deepEqual(resolveCreateLocation("roblox"), { view: "studio", env: "roblox" });
  assert.deepEqual(resolveCreateLocation("blender"), { view: "studio", env: "blender" });
  assert.deepEqual(resolveCreateLocation("studio", "roblox"), { view: "studio", env: "roblox" });
  assert.deepEqual(resolveCreateLocation("studio", "blender"), { view: "studio", env: "blender" });
  assert.deepEqual(resolveCreateLocation("studio"), { view: "studio", env: null }, "no env: the remembered one is used");
  assert.deepEqual(resolveCreateLocation("studio", "maya"), { view: "studio", env: null }, "unknown env is ignored, not trusted");
  // Legacy tab names win over a stray env.
  assert.deepEqual(resolveCreateLocation("roblox", "blender"), { view: "studio", env: "roblox" });
  assert.deepEqual(resolveCreateLocation("mobile", "blender"), { view: "mobile", env: null });
  for (const t of ["images", "video"] as const) assert.deepEqual(resolveCreateLocation(t, "blender"), { view: "app", env: null }, `${t} is not a Create tab`);
  for (const t of [null, undefined, "", "site", "app", "nope"]) assert.deepEqual(resolveCreateLocation(t), { view: "app", env: null }, String(t));
});

test("Create links: read from full URLs, relative URLs and garbage without throwing", () => {
  assert.deepEqual(locationFromUrl("https://keplar.one/app/create?tab=blender"), { view: "studio", env: "blender" });
  assert.deepEqual(locationFromUrl("/app/create?tab=studio&env=roblox"), { view: "studio", env: "roblox" });
  assert.deepEqual(locationFromUrl("/signin?next=/app/create?tab=blender"), { view: "app", env: null }, "only Create's own query counts");
  assert.deepEqual(locationFromUrl(null), { view: "app", env: null });
  assert.deepEqual(locationFromUrl("http://[bad"), { view: "app", env: null });
});

test("Create URL: tab switches write the canonical form and keep unrelated params", () => {
  assert.equal(createSearch("?tab=roblox&x=1", "studio", "roblox"), "?tab=studio&x=1&env=roblox");
  assert.equal(createSearch("?tab=studio&env=roblox", "studio", "blender"), "?tab=studio&env=blender");
  assert.equal(createSearch("?tab=studio&env=blender&x=1", "app", "blender"), "?x=1");
  assert.equal(createSearch("?tab=studio&env=blender", "mobile", "blender"), "?tab=mobile");
  assert.equal(createSearch("", "app", "roblox"), "");
  // Round trip: what we write is what we read back.
  for (const e of ["roblox", "blender"] as const) assert.deepEqual(locationFromUrl(`/app/create${createSearch("", "studio", e)}`), { view: "studio", env: e });
  assert.equal(studioHref("blender"), "/app/create?tab=studio&env=blender");
});

test("Keplar Studio remembers the last environment; blocked storage never throws", () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(readRememberedEnv(store), null);
  rememberEnv("blender", store);
  assert.equal(mem.get(STUDIO_ENV_KEY), "blender");
  assert.equal(readRememberedEnv(store), "blender");
  mem.set(STUDIO_ENV_KEY, "<script>");
  assert.equal(readRememberedEnv(store), null, "only known environments are read back");
  const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.equal(readRememberedEnv(blocked), null);
  assert.doesNotThrow(() => rememberEnv("roblox", blocked));
  assert.equal(readRememberedEnv(null), null);
  // No window in node: the defaults fall back to "no storage".
  assert.equal(readRememberedEnv(), null);
  assert.doesNotThrow(() => rememberEnv("roblox"));
  // The link wins, then memory, then Roblox Studio.
  assert.equal(pickEnv("blender", "roblox"), "blender");
  assert.equal(pickEnv(null, "blender"), "blender");
  assert.equal(pickEnv(null, null), DEFAULT_STUDIO_ENV);
  assert.equal(DEFAULT_STUDIO_ENV, "roblox");
});

test("outside the desktop app a Keplar Studio link lands on App with a note; never inside it", () => {
  assert.equal(studioRequested("studio", false), true);
  assert.equal(studioRequested("studio", true), false);
  assert.equal(studioRequested("app", false), false);
  assert.deepEqual(STUDIO_ENVS.map((e) => [e.id, e.label, e.href]), [["roblox", "Roblox Studio", "/roblox-studio-ai"], ["blender", "Blender", "/blender-ai"]]);
  assert.equal(studioEnvLabel("blender"), "Blender");
});

test("Create shows one Keplar Studio tab (desktop only) and mounts the Keplar Studio Workspace inside it", () => {
  const create = read("src/components/create/CreateStudio.tsx");
  // UI v2: the kinds are kit Tabs items; Keplar Studio is one of them only with the desktop bridge.
  assert.match(create, /\.\.\.\(desktop \? \[\{ value: "studio" as const, label: "Keplar Studio" \}\] : \[\]\)/);
  assert.doesNotMatch(create, /value: "roblox"|value: "blender"/, "no separate Roblox Studio / Blender tabs");
  assert.match(create, /import\("@\/components\/app-ui\/studio-mode\/workspace\/Workspace"\)/, "lazy");
  assert.match(create, /<StudioWorkspace env="roblox" plan=\{plan\} signedIn=\{shown === "in"\} onEnvChange=\{pickEnvironment\} \/>/);
  assert.match(create, /<StudioWorkspace env="blender" plan=\{plan\} signedIn=\{shown === "in"\} onEnvChange=\{pickEnvironment\} \/>/);
  assert.match(create, /desktop && \(envSeen\.roblox \|\| envSeen\.blender\)/, "the pane needs the desktop bridge");
  const pane = read("src/components/create/studio/KeplarStudioPane.tsx");
  assert.match(pane, /role="tablist" aria-label="Environment"/);
  assert.match(pane, /href="\/download"/, "the outside-desktop note links to a real download page");
  const css = read("src/components/create/studio/keplarStudio.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /backdrop-filter|blur\(|gradient|box-shadow/, "no glass, blur, gradient or shadow");
});

test("feature catalogue: Keplar Studio groups Roblox Studio, Roblox Cloud, Blender and Blender Cloud with real availability", () => {
  assert.equal(PRODUCTS["keplar-studio"], KEPLAR_STUDIO);
  assert.equal(KEPLAR_STUDIO.name, "Keplar Studio");
  assert.deepEqual(KEPLAR_STUDIO.environments.map((e) => e.name), ["Roblox Studio", "Blender"]);
  assert.deepEqual(productFeatures("keplar-studio").map((f) => f.id), ["roblox-studio", "roblox-cloud", "blender", "blender-cloud"]);
  // Grouped features sit next to each other in one chapter, so /features can head them once.
  const create = CHAPTERS.find((c) => c.id === "create")!;
  const idx = create.features.map((f, i) => (f.product ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(idx, idx.map((_, k) => idx[0]! + k));
  // No duplicate top-level Roblox/Blender "mode" entries; each keeps a working URL and its availability note.
  assert.ok(!ALL_FEATURES.some((f) => / mode$/.test(f.name) && /Roblox|Blender/.test(f.name)));
  for (const f of productFeatures("keplar-studio")) {
    assert.match(f.href, /^\/(roblox-studio-ai|blender-ai)$/);
    assert.ok(f.note && /Desktop app|Scripts only/.test(f.note), f.id);
    assert.equal(f.status, "beta");
  }
  // Plans are as the app enforces them (Lite and up), not invented here.
  for (const p of ["lite", "plus", "pro"]) assert.ok(STUDIO_PLANS.has(p));
  assert.ok(!STUDIO_PLANS.has("free"));
  assert.match(ALL_FEATURES.find((f) => f.id === "roblox-studio")!.note!, /Lite and up/);
  assert.match(ALL_FEATURES.find((f) => f.id === "blender")!.note!, /Lite and up/);
  // The /features row anchors the product.
  const view = read("src/components/i18n/pages/FeaturesView.tsx");
  assert.match(view, /<tr id=\{product\.id\}/);
  assert.equal(KEPLAR_STUDIO.href, "/features#keplar-studio");
});

test("Roblox Studio and Blender landing pages keep their URLs and carry the Keplar Studio name", () => {
  for (const [slug, env] of [["roblox-studio-ai", "Roblox Studio"], ["blender-ai", "Blender"]] as const) {
    const p = landingBySlug(slug)!;
    assert.equal(p.path, `/${slug}`);
    assert.equal(p.label, `Keplar Studio · ${env}`);
    assert.match(p.lede, /^Keplar Studio, the co-builder in the /);
  }
});
