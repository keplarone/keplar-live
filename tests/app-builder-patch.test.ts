/**
 * Fast edits (src/lib/app-builder/patch.ts): SEARCH/REPLACE edits are parsed, placed exactly once (or loosely when only the
 * indentation differs), reported instead of guessed when they miss, retried once with the misses shown to the model, and a
 * structural change falls back to the full builder via <needs-plan>. The pipeline tries this first for every edit.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEdits, contextFor, locate, parseEdits, quickEdit } from "@/lib/app-builder/patch";
import { APP_BUILD_LIMITS, APP_MODELS } from "@/lib/app-builder/models";
import type { AppSpec } from "@/lib/app-builder/types";

const edit = (path: string, search: string, replace: string) => `<edit path="${path}">\n<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE\n</edit>`;

test("parseEdits: edits, new files, the summary and needs-plan", () => {
  const p = parseEdits(`<summary>Made the header sticky.</summary>\n${edit("styles/app.css", ".top { position: static; }", ".top { position: sticky; top: 0; }")}\n<file path="styles/extra.css">\n.x { color: red; }\n</file>`);
  assert.equal(p.needsPlan, null);
  assert.equal(p.summary, "Made the header sticky.");
  assert.deepEqual(p.edits, [{ path: "styles/app.css", search: ".top { position: static; }", replace: ".top { position: sticky; top: 0; }" }]);
  assert.ok(p.files["styles/extra.css"]?.includes("color: red"));
  assert.equal(parseEdits(`<needs-plan reason="Needs a new Invoices collection."/>`).needsPlan, "Needs a new Invoices collection.");
});

test("locate: exact unique match, loose match ignoring indentation, and ambiguity is a miss", () => {
  const src = "function a() {\n    return 1;\n}\nfunction b() {\n    return 2;\n}\n";
  assert.deepEqual(locate(src, "return 2;"), [src.indexOf("return 2;"), src.indexOf("return 2;") + 9]);
  assert.ok(locate(src, "function b() {\nreturn 2;\n}"), "re-indented SEARCH still lands");
  assert.equal(locate(src, "}"), null, "a SEARCH that matches twice is not guessed");
  assert.equal(locate(src, "return 3;"), null);
});

test("applyEdits: applies in order and reports misses without touching anything else", () => {
  const files = { "app.js": "const title = 'Tasks';\nexport default title;\n", "screens/home.js": "<h1>Tasks</h1>\n" };
  const r = applyEdits(files, [
    { path: "app.js", search: "const title = 'Tasks';", replace: "const title = 'To-dos';" },
    { path: "screens/home.js", search: "<h1>Nope</h1>", replace: "x" },
    { path: "missing.js", search: "a", replace: "b" },
  ]);
  assert.equal(r.files["app.js"], "const title = 'To-dos';\nexport default title;\n");
  assert.equal(r.files["screens/home.js"], files["screens/home.js"], "a missed edit leaves the file as it was");
  assert.deepEqual(r.changed, ["app.js"]);
  assert.deepEqual(r.failed.map((f) => [f.path, f.why]), [["screens/home.js", "not found"], ["missing.js", "no such file"]]);
});

test("contextFor: everything in full while it fits; past the budget, the files that mention the request stay full", () => {
  const small = contextFor({ "a.js": "alpha", "b.js": "beta" }, "change alpha");
  assert.deepEqual([...small.full].sort(), ["a.js", "b.js"]);
  const big = contextFor({ "pricing.js": "pricing table ".repeat(200), "other.js": "x".repeat(4000), "index.html": "<html>" }, "make the pricing table green", 6000);
  assert.ok(big.full.has("pricing.js"));
  assert.ok(!big.full.has("other.js"));
  assert.ok(!big.text.includes("index.html"), "index.html is written by the builder, never edited");
});

const spec = { name: "Tasks", tagline: "", kind: "tool", summary: "", scope: "", uses: [], notBuilt: [], features: [], pages: [{ route: "/", title: "Home", purpose: "" }], collections: [], ai: [], auth: { enabled: false }, images: [], files: [{ path: "app.js", role: "js", purpose: "" }] } as unknown as AppSpec;

function fakeModel(answers: string[]) {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages: { content: string }[] };
    asked.push(body.messages.at(-1)!.content);
    const content = answers.shift() ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.001 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { asked, restore: () => { globalThis.fetch = real; } };
}

test("quickEdit: applies the model's edits and returns only what changed", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-patch";
  const m = fakeModel([`<summary>Renamed Tasks to To-dos.</summary>\n${edit("app.js", "const title = 'Tasks';", "const title = 'To-dos';")}`]);
  try {
    const r = await quickEdit({ spec, designBrief: "", files: { "app.js": "const title = 'Tasks';\n", "lib/x.js": "export const x = 1;\n" }, request: "Rename Tasks to To-dos", chain: [APP_MODELS.flash], L: APP_BUILD_LIMITS.business, deadline: Date.now() + 60_000 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.changed, ["app.js"]);
    assert.equal(r.files["app.js"], "const title = 'To-dos';\n");
    assert.equal(r.files["lib/x.js"], "export const x = 1;\n");
    assert.equal(r.summary, "Renamed Tasks to To-dos.");
  } finally { m.restore(); delete process.env.OPENROUTER_API_KEY; }
});

test("quickEdit: a missed SEARCH is shown to the model once, and the retry's edit lands", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-patch";
  const m = fakeModel([edit("app.js", "const title = 'Task';", "x"), edit("app.js", "const title = 'Tasks';", "const title = 'Done';")]);
  try {
    const r = await quickEdit({ spec, designBrief: "", files: { "app.js": "const title = 'Tasks';\n" }, request: "Rename", chain: [APP_MODELS.flash], L: APP_BUILD_LIMITS.business, deadline: Date.now() + 60_000 });
    assert.equal(r.ok, true);
    assert.equal(r.files["app.js"], "const title = 'Done';\n");
    assert.match(m.asked[1], /DID NOT APPLY/);
  } finally { m.restore(); delete process.env.OPENROUTER_API_KEY; }
});

test("quickEdit: <needs-plan> falls back to the full builder, untouched", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-patch";
  const m = fakeModel([`<needs-plan reason="Needs an Invoices collection and two new screens."/>`]);
  try {
    const files = { "app.js": "const title = 'Tasks';\n" };
    const r = await quickEdit({ spec, designBrief: "", files, request: "Add invoicing", chain: [APP_MODELS.flash], L: APP_BUILD_LIMITS.business, deadline: Date.now() + 60_000 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "Needs an Invoices collection and two new screens.");
    assert.equal(r.files, files);
  } finally { m.restore(); delete process.env.OPENROUTER_API_KEY; }
});

test("pipeline: every edit tries the quick path first, verifies it in the browser, and skips the slow review", () => {
  const p = readFileSync("src/lib/app-builder/pipeline.ts", "utf8");
  assert.match(p, /quick: "try" as const/);
  assert.match(p, /Patching only what changes/);
  assert.match(p, /if \(!quick && left\(\) > 45\)/, "no design review on a quick edit");
  assert.match(p, /This change needs the full builder/);
});
