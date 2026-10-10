import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const glass = read("src/styles/glass.css");

test("shape tokens exist: pill, control (rounded rectangle) and card", () => {
  assert.match(glass, /--shape-pill:\s*9999px/);
  assert.match(glass, /--shape-control:\s*12px/);
  assert.match(glass, /--shape-card:\s*16px/);
});

test("buttons default to a rounded rectangle at zero specificity, so a component's own class decides its shape", () => {
  const m = /:where\(button,[^)]*\)\s*\{([^}]*)\}/.exec(glass);
  assert.ok(m, "default rule uses :where()");
  assert.match(m![1], /border-radius:\s*var\(--shape-control\)/);
  assert.doesNotMatch(glass, /html :where\(button/, "the old sitewide pill rule is gone");
  assert.doesNotMatch(m![1], /9999px|var\(--shape-pill\)/);
});

test("pill is an explicit opt-in", () => {
  assert.match(glass, /html \.pill,\s*html \[data-shape="pill"\]\s*\{\s*border-radius:\s*var\(--shape-pill\)/);
});

test("tabs, dropdown triggers, sidebar items and list rows are not pills", () => {
  const css = (f: string) => read(f);
  const rule = (file: string, sel: string) => {
    const re = new RegExp(`(^|\\n|\\})\\s*${sel.replace(/[.>[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
    return [...css(file).matchAll(re)].map((x) => x[2]).join(" ");
  };
  const notPill = [
    ["src/components/app-ui/App.module.css", ".sideItem"],
    ["src/components/app-ui/AccountMenu.module.css", ".chip"],
    ["src/components/app-ui/AccountMenu.module.css", ".item"],
    ["src/components/business/business.module.css", ".tab"],
    ["src/components/study/study.module.css", ".tab"],
    ["src/components/kb/kb.module.css", ".navLink"],
  ];
  for (const [f, s] of notPill) {
    const body = rule(f, s);
    assert.ok(body, `${f} ${s}`);
    assert.doesNotMatch(body, /border-radius:\s*(9999px|999px|var\(--r-pill|var\(--shape-pill)/, `${f} ${s} must not be a pill`);
  }
});
