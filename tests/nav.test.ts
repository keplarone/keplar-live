import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");

test("sidebar: New chat and Search, then Ask, Create and Study; no Business entry (Keplar Business is its own app)", () => {
  assert.match(side, /<span>New chat<\/span>/);
  assert.match(side, /data-nav="search"/);
  assert.match(side, /<span>Research<\/span>/);
  assert.match(side, /<span>Space Studio<\/span>/);
  const block = side.slice(side.indexOf("const primary"), side.indexOf("const secondary"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Ask", "Create", "Study"]);
  assert.doesNotMatch(side, /data-nav="business"|BUSINESS_URL/, "Keplar One has no way into Business from its sidebar");
  assert.doesNotMatch(readFileSync("src/components/app-ui/SearchDialog.tsx", "utf8"), /id: "business"/, "nor from search");
  assert.match(readFileSync("src/lib/business-site.ts", "utf8"), /https:\/\/business\.keplar\.one/);
  assert.doesNotMatch(side, /label: "(Agents|Approvals|Business)"/, "Agents and Approvals are business-mode only");
});

test("sidebar: More holds every other view; Settings, Memory and Usage moved to the gear and the account menu", () => {
  const block = side.slice(side.indexOf("const secondary"), side.indexOf("const LOW_AT"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  for (const v of ["Projects", "Slides", "Deployments", "All chats"]) assert.ok(labels.includes(v), v);
  assert.ok(!labels.includes("Study"), "Study is a primary row");
  assert.ok(!labels.includes("Approvals") && !labels.includes("Business"));
  assert.match(side, /href="\/account" className=\{s\.iconBtn\} aria-label="Settings"/);
  const menu = readFileSync("src/components/app-ui/AccountMenu.tsx", "utf8");
  assert.match(menu, /<ThemeControl compact \/>/, "theme lives in the account menu");
  assert.match(menu, /href="\/account#language"/);
  assert.match(menu, /href="\/docs"/);
  assert.doesNotMatch(side, /ThemeControl/, "no theme toggle in the sidebar itself");
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
