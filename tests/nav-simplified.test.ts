import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { primaryNav, footerNav } from "../src/lib/site";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const routeExists = (href: string) => {
  const p = href.split("#")[0].replace(/^\//, "");
  return !p || existsSync(`src/app/(marketing)/${p}`) || existsSync(`src/app/${p}`);
};

test("marketing nav: Product menu first, Docs, Pricing and Download direct; every entry is a real route; footer keeps the core pages", () => {
  assert.equal(primaryNav[0].label, "Product");
  assert.ok((primaryNav[0].children ?? []).length >= 3, "Product opens a menu");
  assert.ok(["/docs", "/pricing", "/download"].every((h) => primaryNav.some((l) => l.href === h && !l.children)), "Docs, Pricing and Download are direct links");
  for (const l of primaryNav) for (const c of l.children ?? [l]) assert.ok(routeExists(c.href), `${c.label} → ${c.href}`);
  const footer = footerNav.flatMap((g) => g.links.map((l) => l.href));
  for (const h of ["/keplar-one", "/pricing", "/features", "/showcase", "/templates", "/roadmap", "/developers", "/docs"]) assert.ok(footer.includes(h), `${h} stays in the footer`);
  assert.ok(primaryNav.length <= 4, "the centre stays short");
});

test("marketing nav: no separate Upgrade button, one Try button per surface, menus keyboard-operable, palette trigger present", () => {
  const nav = read("src/components/chrome/Nav.tsx");
  assert.doesNotMatch(nav, /["'>]Upgrade["'<]|planLink|data-plan-cta/);
  assert.equal((nav.match(/<ButtonLink href=\{tryHref\}/g) ?? []).length, 2, "Try Keplar in the capsule and in the mobile sheet");
  assert.match(nav, /Escape/);
  assert.match(nav, /ArrowDown/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(nav, /PaletteButton/);
  assert.match(read("src/components/app-ui/Sidebar.tsx"), /data-plan-cta/); // in-app upgrade is untouched
  // mobile sheet lists every menu's pages too, and is a labelled modal with a search entry
  assert.match(nav, /flatMap\(\(l, i\)/);
  assert.match(nav, /aria-label=\{t\.siteMenu\}/); assert.match(read("src/lib/i18n/messages/common/en.ts"), /siteMenu: "Site menu"/) /* labels come from the locale catalog; English stays "Site menu" */;
});
