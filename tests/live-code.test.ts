import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIVE_TEXT_MAX } from "../src/lib/app-builder/generate";

// build-client.ts and BuildTimeline.tsx pull in CSS modules, which this test runner can't load, so the client side is checked
// against its source; the generator (pure) is imported.

test("live code: the generator sends each written file's text with its file event, capped", () => {
  assert.equal(LIVE_TEXT_MAX, 64_000);
  assert.match(readFileSync("src/lib/app-builder/generate.ts", "utf8"), /o\.onEvent\(\{ type: "file", path: p, bytes: c\.length, text: c\.slice\(0, LIVE_TEXT_MAX\) \}\)/);
  assert.match(readFileSync("src/lib/app-builder/pipeline.ts", "utf8"), /\| \{ type: "file"; path: string; bytes: number; text\?: string \}/);
});

test("live code: the browser keeps the text per file (newest wins; a path-only event keeps what is shown)", () => {
  const client = readFileSync("src/components/create/apps/build-client.ts", "utf8");
  assert.match(client, /if \(typeof ev\.text === "string"\) n\.code = \{ \.\.\.l\.code, \[ev\.path as string\]: ev\.text \};/);
  const timeline = readFileSync("src/components/create/apps/BuildTimeline.tsx", "utf8");
  assert.match(timeline, /code: Record<string, string>;/);
  assert.match(timeline, /files: \[\], code: \{\}, writing: \{\},/);
});

test("live code: Create shows the code being written under the build timeline, following the newest file, with the build log", () => {
  assert.match(readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8"), /<LiveCode live=\{live\} running=\{running\} \/>/);
  const pane = readFileSync("src/components/create/apps/LiveCode.tsx", "utf8");
  assert.match(pane, /const pick = pinned && live\.code\[pinned\] !== undefined \? pinned : newest;/);
  assert.match(pane, /Follow latest/);
  assert.match(pane, /aria-label="Build log"/);
});

test("go to file: subsequence matching, best match first, file-name hits before directory hits", async () => {
  const { matchScore, rankPaths } = await import("../src/components/create/apps/code-nav");
  const files = ["index.html", "app.js", "pages/feed.js", "pages/profile.js", "lib/api.js", "styles/app.css"];
  assert.equal(matchScore("pages/feed.js", "pgfd") !== null, true, "pgfd finds pages/feed.js");
  assert.equal(matchScore("pages/feed.js", "zz"), null);
  assert.equal(rankPaths(files, "feed")[0], "pages/feed.js");
  assert.equal(rankPaths(files, "app")[0], "app.js", "a tight file-name match beats a looser one");
  assert.deepEqual(rankPaths(files, ""), [...files].sort(), "empty query lists every file");
  assert.equal(rankPaths(files, "css")[0], "styles/app.css");
  assert.equal(rankPaths(files, "q", 50).length, 0, "no path contains a q");
});

test("tasks: each step's state follows the build stage; a finished build is all done; planned screens tick off as files land", async () => {
  const { stepState, screenWritten } = await import("../src/components/create/apps/code-nav");
  assert.equal(stepState("plan", "generate", true), "done");
  assert.equal(stepState("generate", "generate", true), "active");
  assert.equal(stepState("verify", "generate", true), "todo");
  assert.equal(stepState("save", "fix", true), "todo", "fixing comes before saving");
  assert.equal(stepState("visual", "fix", true), "done");
  for (const st of ["plan", "generate", "verify", "visual", "save"]) {
    assert.equal(stepState(st, "done", false), "done");
    assert.equal(stepState(st, "", false), "done", "a build shown after the fact");
  }
  assert.equal(stepState("plan", "", true), "todo", "a build that has not reported a stage yet");
  const written = ["index.html", "pages/feed.js", "pages/home.js"];
  assert.equal(screenWritten("/feed", written), true);
  assert.equal(screenWritten("/", written), true, "/ is the home page");
  assert.equal(screenWritten("/profile/:id", written), false);
  assert.equal(screenWritten("/profile/:id", [...written, "pages/profile.js"]), true);
});

test("Business workspace scrolls: the shell's one grid row is pinned to the window and the main column can shrink", () => {
  const css = readFileSync("src/components/business-app/cursor.module.css", "utf8");
  // An auto grid row grew with the page, so the scrolling main body was never shorter than its content (Create could not scroll).
  assert.match(css, /\.shell \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(css, /\.main \{ min-width: 0; min-height: 0;/);
  assert.match(css, /\.mainBody \{ flex: 1; min-height: 0; overflow-y: auto; \}/);
  // Keplar One's page-entry slide never moves the workspace window.
  assert.match(readFileSync("src/styles/redesign.css", "utf8"), /#main:not\(\[data-kb\]\) > :not\(\[class\*="Sky-module__"\]\[class\$="__backdrop"\]\):not\(\[class\*="workspace-module__"\]\) >/);
});

test("Create in Business is an IDE: Explorer, editor, Pipeline and a status bar that fit the window; Keplar One keeps its layout", () => {
  const frame = readFileSync("src/components/create/apps/IdeFrame.tsx", "utf8");
  assert.match(frame, /if \(!enabled\) return <>\{children\}<\/>;/, "outside Business the start screen renders unchanged");
  for (const label of ["Explorer", "Build pipeline", "Brief"]) assert.match(frame, new RegExp(`aria-label="${label}"`));
  assert.match(frame, /el\.hasAttribute\("data-business-app"\)/);
  assert.match(readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8"), /<IdeFrame enabled=\{biz\}[\s\S]*?<\/IdeFrame>/);
  assert.match(readFileSync("src/components/business-app/workspace.module.css", "utf8"), /\.module:has\(\[data-ide\]\) \{ height: 100%; \}/);
  assert.match(readFileSync("src/components/create/apps/studio.module.css", "utf8"), /\.ide \{ height: 100%; min-height: 0; display: grid;/);
});

test("spec.json: the build request shows the brief, the look and this plan's model and limits; nothing invented without a config", async () => {
  const { buildRequestJson } = await import("../src/components/create/apps/code-nav");
  const cfg = { plan: "business", planLabel: "Keplar Business Growth", verified: true, maxProjects: 100, projects: 2, model: "Claude Opus 5.5", estimateUnits: 2475, maxUnits: 5500, limits: { files: 40, pages: 24, collections: 24, backend: true, ai: true, images: 6, fixAttempts: 3, visual: true }, styles: [], fonts: [] };
  const auto = JSON.parse(buildRequestJson({ brief: "  A salon booking app  ", auto: true, design: null, cfg }));
  assert.equal(auto.brief, "A salon booking app", "trimmed");
  assert.match(auto.look, /^auto/);
  assert.equal(auto.model, "Claude Opus 5.5");
  assert.deepEqual(auto.estimate, { credits: 2475, max: 5500 });
  assert.equal(auto.limits.screens, 24);
  assert.equal(auto.limits.designReview, true);
  const design = { style: "editorial", mode: "dark", palette: null, fonts: "serif", shape: "soft", density: "airy", motion: "calm" } as never;
  const chosen = JSON.parse(buildRequestJson({ brief: "", auto: false, design, cfg: null }));
  assert.equal(chosen.brief, null, "an empty brief is null, not a made-up example");
  assert.equal(chosen.look.style, "editorial");
  assert.equal(chosen.look.palette, "from the style");
  assert.equal(chosen.model, null);
  assert.equal(chosen.limits, null);
});

test("IDE editor tabs: brief.md, spec.json and build.log are real tabs; the composer stays mounted on the others", () => {
  const frame = readFileSync("src/components/create/apps/IdeFrame.tsx", "utf8");
  assert.match(frame, /role="tablist" aria-label="Editor"/);
  assert.match(frame, /role="tab"[\s\S]*?aria-selected=\{tab === t\.id\}/);
  assert.match(frame, /id="ide-panel-brief" aria-labelledby="ide-tab-brief" hidden=\{tab !== "brief"\}>\{children\}/, "hidden, not unmounted");
  assert.match(frame, /e\.key !== "ArrowRight" && e\.key !== "ArrowLeft"/, "arrow keys move between tabs");
  assert.match(frame, /No build has run in this session yet/);
  assert.match(readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8"), /getBrief=\{\(\) => store\.text\(\)\} auto=\{auto\} design=\{design\} log=\{live\.log\}/);
});

test("desktop preview is a real 1920x1080 viewport scaled to fit (never upscaled), in the app builder and the chat builder", async () => {
  const { viewportScale, DESKTOP_VIEWPORT } = await import("../src/components/create/ScaledViewport");
  assert.deepEqual(DESKTOP_VIEWPORT, { w: 1920, h: 1080 });
  assert.equal(viewportScale({ w: 960, h: 1000 }), 0.5, "width-bound pane");
  assert.equal(viewportScale({ w: 1920, h: 540 }), 0.5, "height-bound pane");
  assert.equal(viewportScale({ w: 3840, h: 2160 }), 1, "never larger than 1:1");
  assert.equal(viewportScale({ w: 1200, h: null }), 0.625, "fit to width only (inline card)");
  assert.equal(viewportScale({ w: 0, h: 0 }), 1, "unmeasured: no scaling");
  // The studio pane is filled edge to edge at a desktop width (1280-1920px), never letterboxed.
  const { fillViewport } = await import("../src/components/create/ScaledViewport");
  assert.deepEqual(fillViewport({ w: 800, h: 600 }), { w: 1280, h: 960, k: 0.625 }, "narrow pane: a 1280px desktop, scaled down, as tall as the pane");
  assert.deepEqual(fillViewport({ w: 1600, h: 900 }), { w: 1600, h: 900, k: 1 }, "wide pane: laid out at the pane's own size");
  assert.deepEqual(fillViewport({ w: 2400, h: 1200 }), { w: 1920, h: 1200, k: 1 }, "never wider than 1920px");
  assert.match(readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8"), /return device === "desktop" \? <ScaledViewport fit="fill">\{frame\}<\/ScaledViewport> : frame;/);
  assert.doesNotMatch(readFileSync("src/components/create/ScaledViewport.tsx", "utf8"), /overflow: "hidden"/, "clip, never hidden: focus inside the iframe can't scroll the wrappers");
  assert.match(readFileSync("src/components/app-ui/create/CreateTurn.tsx", "utf8"), /return device === "desktop" \? <ScaledViewport fit="width">\{frame\}<\/ScaledViewport> : frame;/);
});
