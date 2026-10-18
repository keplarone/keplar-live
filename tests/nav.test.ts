import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");

test("sidebar: New chat, Search and Recents; modes are not navigation (Keplar Business is its own app)", () => {
  assert.match(side, /<span>New chat<\/span>/);
  assert.match(side, /data-nav="search"/);
  assert.match(side, /<Recents/);
  assert.doesNotMatch(side, /Space Studio|SPACE_URL|data-nav="space"/, "Space Studio is not linked from the keplar.one sidebar");
  for (const label of ["Ask", "Create", "Study", "Research", "Slides", "Projects", "Deployments", "Connected apps", "All chats"]) {
    assert.doesNotMatch(side, new RegExp(`<span>${label}</span>`), `${label} is not a sidebar row`);
  }
  assert.doesNotMatch(side, /data-nav="(?:thread|create|study|slides|projects|research|deployments|apps|history)"/);
  assert.doesNotMatch(side, /data-more=/);
  assert.doesNotMatch(side, /data-nav="business"|BUSINESS_URL/, "Keplar One has no way into Business from its sidebar");
  assert.doesNotMatch(readFileSync("src/components/app-ui/SearchDialog.tsx", "utf8"), /id: "business"/, "nor from search");
  assert.match(readFileSync("src/lib/business-site.ts", "utf8"), /https:\/\/business\.keplar\.one/);
  assert.doesNotMatch(side, /label: "(Agents|Approvals|Business)"/, "Agents and Approvals are business-mode only");
});

test("modes open beside the chat; /app/create and the other routes still render their views", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /BESIDE_VIEWS = new Set<View>\(\["create", "slides", "study"/);
  assert.match(app, /className=\{s\.beside\}/);
  assert.match(app, /state\.view === "create"/);
  assert.match(app, /state\.view === "study"/);
  assert.match(app, /state\.view === "slides"/);
  const composer = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(composer, /data-suggest=\{suggestion\.key\}/);
  assert.match(composer, /\/\(create\|study\|slides\|debate\|web\|reason\|research\)/);
  assert.match(composer, /Or type \/create, \/study, \/slides/);
});

test("sidebar: Settings stays on the account row; theme, language and docs stay in the account menu", () => {
  assert.match(side, /href="\/account" className=\{s\.iconBtn\} aria-label="Settings"/);
  const menu = readFileSync("src/components/app-ui/AccountMenu.tsx", "utf8");
  assert.match(menu, /<ThemeControl compact \/>/, "theme lives in the account menu");
  assert.match(menu, /href="\/account#language"/);
  assert.match(menu, /href="\/docs"/);
  assert.doesNotMatch(side, /ThemeControl/, "no theme toggle in the sidebar itself");
  assert.doesNotMatch(side, /ExploreLinks/, "explore links are not a second nav under Recents");
});

test("home greets by time of day and first name (fallback 'Welcome to Keplar.') and keeps the most frequently asked questions (not recents)", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /Welcome to Keplar\./);
  assert.match(app, /dayGreeting\(new Date\(\)\.getHours\(\)\)/);
  assert.match(app, /className=\{s\.welcomeName\}>\{firstName\}/);
  const home = readFileSync("src/components/app-ui/HomeStart.tsx", "utf8");
  assert.match(home, /Most frequently asked question/);
  assert.doesNotMatch(home, /Pick up where you left off/);
  assert.match(home, /fetch\("\/api\/faq"\)/);
  assert.match(home, /onClick=\{\(\) => onSend\(q\.text\)\}/);
});
