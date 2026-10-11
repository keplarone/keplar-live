import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURE_COMMANDS, rankCommands, staticCommands } from "@/lib/nav/commands";

const routeExists = (href: string) => {
  if (href === "https://business.keplar.one") return true; // Keplar Business: its own site, not a route on keplar.one
  const p = href.split("#")[0].replace(/^\//, "");
  if (!p) return true;
  const candidates = [`src/app/(marketing)/${p}/page.tsx`, `src/app/${p}/page.tsx`, `src/app/(marketing)/${p}/[[...slug]]/page.tsx`];
  return candidates.some((c) => existsSync(c)) || existsSync(`src/app/(marketing)/${p}`) || existsSync(`src/app/${p}`);
};

test("palette: no destination is a keplar.one URL that only redirects to Keplar Business", () => {
  const redirected = ["/enterprise", "/agents", "/app/agents", "/app/approvals", "/app/business"];
  for (const c of staticCommands()) assert.ok(!redirected.includes(c.href.split("#")[0]), `${c.label} → ${c.href} redirects to business.keplar.one; link it directly`);
});

test("palette: every static destination is a real route in the tree", () => {
  for (const c of staticCommands()) assert.ok(routeExists(c.href), `${c.label} → ${c.href} has no route`);
});

test("palette: major features are all present (Create, live demo, gallery, changelog, API, Keplar Business)", () => {
  const hrefs = FEATURE_COMMANDS.map((c) => c.href);
  for (const h of ["/app/create", "/app/ask", "/templates", "/changelog", "/developers", "https://business.keplar.one"]) assert.ok(hrefs.includes(h), h);
});

test("palette ranking: label prefix first, keywords match, empty query keeps order, no dupes", () => {
  const all = staticCommands();
  assert.equal(rankCommands(all, "cre")[0].href, "/app/create");
  assert.ok(rankCommands(all, "api").some((c) => c.href === "/developers"));
  assert.ok(rankCommands(all, "demo").some((c) => c.href === "/app/ask"));
  assert.equal(new Set(all.map((c) => c.href)).size, all.length);
  assert.deepEqual(rankCommands(all, "").slice(0, 3), all.slice(0, 3));
  assert.deepEqual(rankCommands(all, "zzzqqq"), []);
});

test("palette a11y: modal dialog, combobox/listbox, Escape, Tab trap, focus restore, Cmd/Ctrl-K", () => {
  const src = readFileSync("src/components/nav/CommandPalette.tsx", "utf8");
  for (const re of [/role="dialog"/, /aria-modal="true"/, /role="combobox"/, /role="listbox"/, /role="option"/, /aria-activedescendant/, /"Escape"/, /e\.key === "Tab"/, /opener\.current/, /metaKey \|\| e\.ctrlKey/]) assert.match(src, re);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<CommandPalette \/>/);
});
