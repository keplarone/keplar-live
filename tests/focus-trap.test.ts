/** /app dialogs and menus: Escape closes only them (never also stops a running answer), Tab stays inside modals, focus returns. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("the app-wide Escape (stop an answer) leaves native dialogs and kit pop-ups alone", () => {
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /closest\?\.\("dialog, \[popover\]"\)\) return;/);
  // The kit Popover consumes Escape itself and returns focus to its anchor.
  const kit = read("src/components/kit/Menu.tsx");
  assert.match(kit, /e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onOpenChange\(false\);\s*anchorRef\.current\?\.focus/);
});

test("non-kit /app layers consume Escape before the app's window shortcut sees it", () => {
  // Lightbox: window capture phase, stopped.
  const lb = read("src/components/app-ui/Lightbox.tsx");
  assert.match(lb, /e\.key === "Escape"\) \{ e\.stopPropagation\(\); close\(\); \}/);
  assert.match(lb, /window\.addEventListener\("keydown", key, true\)/);
  // Settings and the draft pane: document, bubbling (after inner React handlers and window-capture overlays, before window listeners).
  for (const f of ["src/components/account/SettingsDialog.tsx", "src/components/app-ui/parity/DraftPane.tsx"]) {
    const src = read(f);
    assert.match(src, /document\.addEventListener\("keydown", onKey\)/, f);
    assert.doesNotMatch(src, /window\.addEventListener\("keydown", onKey\)/, f);
    assert.match(src, /e\.preventDefault\(\);[^\n]*\s*e\.stopPropagation\(\)/, f);
    assert.match(src, /e\.defaultPrevented/, f);
  }
});

test("share dialogs and the shortcuts list are kit Dialogs (native modal: Tab trapped, Escape owned, focus returned)", () => {
  const dlg = read("src/components/kit/Dialog.tsx");
  assert.match(dlg, /showModal\(\)/);
  assert.match(dlg, /previous\.focus\(/);
  for (const f of ["src/components/app-ui/parity/ShareChatDialog.tsx", "src/components/app-ui/ShareAnswer.tsx", "src/components/app-ui/ThreadBar.tsx"]) {
    assert.match(read(f), /<Dialog\b/, f);
  }
});

test("account menu: opens on its first item, arrows/Home/End move, Escape and picking a link return focus to the chip", () => {
  const menu = read("src/components/app-ui/AccountMenu.tsx");
  for (const k of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.match(menu, new RegExp(`"${k}"`), k);
  assert.match(menu, /openMenu\("first"\)\)\}/, "click / Enter / Space open on the first item");
  assert.doesNotMatch(menu, /openMenu\(null\)/);
  assert.match(menu, /const pick = \(\) => \{ setOpen\(false\); chipRef\.current\?\.focus\(/);
  for (const href of ['href="/account"', 'href="/account#language"', 'href="/docs"', 'href="/account#team"']) {
    assert.match(menu, new RegExp(`${href.replace(/[/#]/g, "\\$&")}[^>]*onClick=\\{pick\\}`), href);
  }
  assert.match(menu, /<Popover [^>]*anchorRef=\{chipRef\}[^>]*role="menu"/);
});
