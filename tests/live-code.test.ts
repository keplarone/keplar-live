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
  assert.match(readFileSync("src/styles/redesign.css", "utf8"), /#main > :not\(\[class\*="Sky-module__"\]\[class\$="__backdrop"\]\):not\(\[class\*="workspace-module__"\]\) >/);
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
