/** Minimal pass (docs/minimal-pass.md): the marketing nav and the app sidebar stay short, and nothing that left them is lost. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { footerNav, paletteOnlyPages, primaryNav } from "../src/lib/site";
import { staticCommands } from "../src/lib/nav/commands";

const routeExists = (href: string) => {
  if (href === "https://business.keplar.one") return true; // Keplar Business: its own site, not a route on keplar.one
  const p = href.split("#")[0].replace(/^\//, "");
  return !p || existsSync(`src/app/(marketing)/${p}`) || existsSync(`src/app/${p}`);
};

test("marketing nav: at most four top-level items, one short menu at most, footer at most four columns", () => {
  assert.ok(primaryNav.length <= 4, `nav has ${primaryNav.length} top-level items`);
  assert.ok(primaryNav.filter((l) => l.children).length <= 1, "at most one dropdown");
  for (const l of primaryNav) assert.ok((l.children ?? []).length <= 4, `${l.label} menu stays short`);
  assert.ok(footerNav.length <= 4, `footer has ${footerNav.length} columns`);
  for (const col of footerNav) assert.ok(col.links.length <= 8, `${col.heading} has ${col.links.length} links`);
});

test("marketing nav: one primary CTA and Sign in; pages that left the nav and footer keep their routes and stay in Cmd-K", () => {
  const nav = readFileSync("src/components/chrome/Nav.tsx", "utf8");
  assert.equal((nav.match(/<Link href=\{tryHref\}/g) ?? []).length, 1, "one Try Keplar pill, at every width");
  const cmds = new Set(staticCommands().map((c) => c.href));
  for (const p of paletteOnlyPages) {
    assert.ok(routeExists(p.href), `${p.href} still exists`);
    assert.ok(cmds.has(p.href), `${p.href} is in Cmd-K`);
  }
  for (const l of primaryNav) for (const c of l.children ?? [l]) assert.ok(cmds.has(c.href), `${c.href} is in Cmd-K`);
  for (const col of footerNav) for (const l of col.links) assert.ok(cmds.has(l.href), `${l.href} is in Cmd-K`);
});

test("app sidebar: at most five primary items, Recents shown directly, usage only when low, compact account row", () => {
  const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");
  const fixed = (side.match(/data-primary=""/g) ?? []).length; // New chat, Search, the mapped primary row template (Business is its own app now)
  const block = side.slice(side.indexOf("const primary"), side.indexOf("const secondary"));
  const mapped = [...block.matchAll(/view: "/g)].length;
  assert.equal(fixed, 3, "New chat, Search and one template for the primary rows");
  assert.ok(2 + mapped <= 5, `sidebar has ${2 + mapped} primary items`);
  const recents = readFileSync("src/components/app-ui/Recents.tsx", "utf8");
  assert.match(recents, /useState\(true\)/, "Recents is open by default");
  assert.match(side, /const low = /);
  assert.match(side, /\{low \? \(/, "the usage line renders only when low");
  assert.match(side, /className=\{s\.accountRow\}/);
  assert.doesNotMatch(side, /brand\.usage\}<\/span>\s*<span className=\{s\.meterValue\}[\s\S]{0,400}<\/nav>/, "no always-on usage card under the nav");
});

test("Settings: one-word categories in the rail, old deep links still land", () => {
  const page = readFileSync("src/components/account/AccountSettings.tsx", "utf8");
  const groups = [...page.matchAll(/\{ id: "([a-z-]+)", label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(groups, ["account", "general", "appearance", "accessibility", "chat", "notifications", "keyboard", "personalization", "memory", "plan", "usage", "security", "privacy", "team", "developer"]);
  assert.doesNotMatch(page, /label: "[^"]*\(beta\)"/, "no '(beta)' in the tab names");
  // Old anchors: section ids (#plan, #usage, #team, #memory, #personalization) or a sub id inside a section.
  for (const id of ["invite", "language", "api", "embed", "typing"]) assert.match(page, new RegExp(`sub\\("${id}"`), `#${id} still has a target`);
  assert.match(readFileSync("src/components/account/SettingsSections.tsx", "utf8"), /closest<HTMLElement>\("\[data-sec\]"\)/, "a deep link opens the group that holds it");
});

test("Create: the empty state is one prompt like Ask; extras sit behind Options; studio shows three tabs plus More", () => {
  const ab = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  const start = ab.slice(ab.indexOf("<div className={s.start}>"), ab.indexOf("<Dialog open={tuneOpen"));
  assert.match(start, /What do you want to build\?/);
  assert.equal((start.match(/<PromptField /g) ?? []).length, 1, "a single prompt");
  const options = start.slice(start.indexOf('id="kc-options"'));
  for (const extra of ["<VoiceLiveTheater", "<LookTiles", "<LiveBlueprint"]) assert.ok(options.includes(extra), `${extra} is behind Options`);
  assert.ok(start.indexOf("<ShipRow") < start.indexOf('id="kc-options"'), "the Build button sits with the prompt");
  assert.match(start, /STARTERS\.slice\(0, 4\)/, "four starter chips");
  assert.match(ab, /const MAIN_TABS: Tab\[\] = \["preview", "code", "changes"\]/);
});

test("overview: a short explanation and one primary ask link, with the old chapter story gone", () => {
  const ch = readFileSync("src/components/marketing/CalmOverview.tsx", "utf8");
  assert.match(ch, /Several models\. One answer\./);
  assert.match(ch, /href="\/"/);
  assert.doesNotMatch(ch, /ShowcaseStrip|VoiceSchematic|data-chapter|SkyHome|MonolithHome/);
});

test("Business: four sections visible, the rest under one More menu, pending approvals still counted", () => {
  const biz = readFileSync("src/components/business/BusinessOS.tsx", "utf8");
  assert.match(biz, /const MAIN_TABS: Tab\[\] = \["overview", "orders", "crm", "inbox"\]/);
  assert.match(biz, /<MoreSections tabs=\{TABS\.filter/);
  assert.match(biz, /pending approvals/);
});

test("Create: References sit inside Options and ride with a new build's prompt (not with edits)", () => {
  const ab = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  const options = ab.slice(ab.indexOf('id="kc-options"'), ab.indexOf("<AppShelf"));
  assert.match(options, /<ReferenceTray [^>]*onChange=\{onRefs\}/);
  // A new build's prompt also carries the build intake answers (withBuildIntake); an edit sends the prompt alone.
  assert.match(ab, /prompt: edit \? prompt : withReferences\(withBuildIntake\(prompt, intake\), refBriefs\.current, cfg\?\.plan\)/);
});

test("agents: schedule notes speak plainly, with no hosting provider or plan names", async () => {
  const { effectiveCadence } = await import("../src/lib/business/schedule-limits");
  for (const [d, m] of [["vercel-cron", 1440], ["vercel-cron", 60], ["inngest", 1440]] as const) {
    const { note } = effectiveCadence(d, m);
    assert.doesNotMatch(note, /Vercel|Hobby|Inngest|cron|server check/i, note);
    assert.match(note, /time you set|hour you set/);
  }
});

test("app top bar: memory status is a quiet icon with its state in the name, one click from its setting", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /href="\/account#memory" className=\{`\$\{s\.memoryChip\}[^`]*`\}[^>]*aria-label=\{sync\.memory \? "Memory on" : "Memory off"\}/);
  assert.doesNotMatch(app, /Memory \{sync\.memory \? "on" : "off"\}/, "no text chip");
});
