import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(`src/components/business-app/${f}`, "utf8");

test("Business prompts take images and video: the home composer, chat follow-ups, and Research/Reason started from home", () => {
  const attach = read("attach.tsx");
  assert.match(attach, /prepareImage\(|prepareVideo\(/, "the same preparation as Keplar One's composer");
  assert.match(attach, /MEDIA_LIMITS\.maxImages/);
  assert.match(attach, /MEDIA_LIMITS\.maxVideos/);
  assert.doesNotMatch(attach, /from "@\/components\/app-ui\/Composer"/, "the Business bundle doesn't load Keplar One's composer");

  const engine = read("engine.ts");
  assert.match(engine, /\.\.\.\(req\.media\?\.images\.length \? \{ media: req\.media \} : \{\}\)/, "media reaches /api/keplar only when there is some");

  const home = read("Home.tsx");
  assert.match(home, /<AttachButton media=\{media\} \/>/);
  assert.match(home, /<MediaTray media=\{media\} \/>/);
  assert.match(home, /onSend\(mode, text\.trim\(\), projectId \|\| null, media\.take\(\)\)/);
  assert.match(home, /disabled=\{!text\.trim\(\) \|\| media\.busy\}/, "no sending while a video is still being read");

  const ask = read("Ask.tsx");
  assert.match(ask, /void ask\(first, firstMedia\)/);
  assert.match(ask, /void ask\(q, media\.take\(\)\)/, "follow-ups can attach too");
  assert.match(ask, /media: m \}/);

  const analyst = read("Analyst.tsx");
  assert.match(analyst, /media: firstMedia\.current/);
  assert.match(analyst, /firstMedia\.current = undefined;/, "attachments go with the first run only");

  const ws = read("BusinessWorkspace.tsx");
  assert.match(ws, /setSentMedia\(media \? \{ key, media \} : null\)/, "media travels in memory");
  assert.doesNotMatch(ws, /writeView\([^)]*media/, "and never into the address bar");
});
