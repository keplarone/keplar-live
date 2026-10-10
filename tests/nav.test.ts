import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");

test("sidebar: New chat and Search, then Create, Agents, Projects in that order (Business takes Projects' row for business users)", () => {
  assert.match(side, /<span>New chat<\/span>/);
  assert.match(side, /data-nav="search"/);
  const block = side.slice(side.indexOf("const primary"), side.indexOf("const BUSINESS"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Create", "Agents", "Projects"]);
  assert.match(side, /businessProminent \? primary\.map\(\(r\) => \(r\.view === "projects" \? BUSINESS : r\)\)/);
});

test("sidebar: More holds every other view; Settings, Memory and Usage moved to the gear and the account menu", () => {
  const block = side.slice(side.indexOf("const secondary"), side.indexOf("const LOW_AT"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  for (const v of ["Slides", "Study", "Deployments", "Approvals", "All chats"]) assert.ok(labels.includes(v), v);
  assert.match(block, /BUSINESS/);
  assert.match(side, /href="\/account" className=\{s\.iconBtn\} aria-label="Settings"/);
  const menu = readFileSync("src/components/app-ui/AccountMenu.tsx", "utf8");
  assert.match(menu, /<ThemeControl compact \/>/, "theme lives in the account menu");
  assert.match(menu, /href="\/account#language"/);
  assert.match(menu, /href="\/docs"/);
  assert.doesNotMatch(side, /ThemeControl/, "no theme toggle in the sidebar itself");
});

test("home greets by first name (fallback 'Welcome to Keplar.') and keeps the most frequently asked questions (not recents)", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /Welcome to Keplar\./);
  assert.match(app, /Welcome back, \$\{firstName\}/);
  const home = readFileSync("src/components/app-ui/HomeStart.tsx", "utf8");
  assert.match(home, /Most frequently asked question/);
  assert.doesNotMatch(home, /Pick up where you left off/);
  assert.match(home, /fetch\("\/api\/faq"\)/);
  assert.match(home, /onClick=\{\(\) => onSend\(q\.text\)\}/);
});
