import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "@/lib/site-builder/sanitize";
import { safeHref } from "@/lib/safe-href";
import { checkOutput, fixOutput } from "@/lib/create/output-checklist";
import { scanBytes } from "@/lib/security/upload-scan";
import { cleanAppHtml } from "@/lib/app-builder/files";

/**
 * Fuzz testing for the parsers that face untrusted input: the site sanitizer, the markdown link guard, the generated-output
 * checklist, the upload scanner and the app HTML cleaner. A seeded generator (reproducible) mixes known-dangerous fragments
 * with random bytes; the invariants are "never throws" and "never lets script through". Seeds are printed on failure.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const FRAGMENTS = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "javascript:alert(1)", "<svg onload=alert(1)>", "<iframe src=//evil>", "<a href='java\u0000script:x'>", "<style>@import url(//evil)</style>", "<base href=//evil/>", "<meta http-equiv=refresh content=0;url=//evil>", "<form action=//evil>", "&lt;script&gt;", "<!--", "-->", "<![CDATA[", "‮", "﻿", "%3Cscript%3E", "<object data=x>", "<template><script>", "<math><mi xlink:href=javascript:x>", "<div style=\"background:url(javascript:x)\">", "<a target=_blank href=//x>", "<input type=password>", "' onmouseover='x", "\"><script>", "<p>fine</p>", "<main><h1>t</h1></main>", "<img alt=\"\" src=a.png>"];
const CHARS = "<>/='\"&;:()\\ abcdefghijklmnopqrstuvwxyz0123456789\n\t\u0000  ";

function mutate(r: () => number): string {
  const parts: string[] = [];
  const n = 1 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    if (r() < 0.55) parts.push(FRAGMENTS[Math.floor(r() * FRAGMENTS.length)]);
    else {
      let s = "";
      const len = Math.floor(r() * 24);
      for (let j = 0; j < len; j++) s += CHARS[Math.floor(r() * CHARS.length)];
      parts.push(s);
    }
  }
  return parts.join("");
}

/** Active content as it would reach a browser: real tags and attributes, not escaped text (the sanitizer re-escapes text, so "javascript:" in a paragraph is just words). */
const ACTIVE = /<script\b|<iframe\b|<object\b|<embed\b|<base\b|<[a-z][^>]*\son[a-z]+\s*=|<[a-z][^>]*\b(?:href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)|<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i;

test("site sanitizer: 600 mutated documents never throw and never contain active content", () => {
  const r = rng(20261017);
  for (let i = 0; i < 600; i++) {
    const input = `<!doctype html><html><head><title>t</title></head><body>${mutate(r)}</body></html>`;
    let out: ReturnType<typeof sanitizeHtml>;
    try {
      out = sanitizeHtml(input);
    } catch (e) {
      assert.fail(`sanitizeHtml threw on case ${i}: ${(e as Error).message}`);
    }
    // Every piece the sanitizer hands back for rendering (head items, body attributes, body markup, links) must be free of active
    // content. `removed` is the human log of what was dropped ("<script> removed") and is never rendered, so it is left out.
    const rendered = { ...out, removed: undefined };
    assert.doesNotMatch(JSON.stringify(rendered), ACTIVE, `case ${i} let active content through`);
  }
});

test("markdown link guard: 2,000 random hrefs never throw and never yield a script URL", () => {
  const r = rng(7);
  const schemes = ["javascript:", "JAVA\tSCRIPT:", "data:text/html,", "vbscript:", "https://", "http://", "mailto:", "//", "/", "  javascript:", "\u0001javascript:", "jav&#x61;script:"];
  for (let i = 0; i < 2000; i++) {
    const href = `${schemes[Math.floor(r() * schemes.length)]}${mutate(r).slice(0, 60)}`;
    const ok = safeHref(href);
    assert.equal(typeof ok, "boolean");
    if (ok) assert.doesNotMatch(href.replace(/[\s\u0000-\u001f]/g, "").toLowerCase(), /^(javascript|vbscript|data:text\/html)/, `case ${i}: ${JSON.stringify(href)} was allowed`);
  }
});

test("generated-output checklist and app cleaner: 300 mutated file sets never throw, and fixOutput stays idempotent", () => {
  const r = rng(99);
  for (let i = 0; i < 300; i++) {
    const files = { "index.html": `<!doctype html><html><head>${mutate(r)}</head><body>${mutate(r)}</body></html>`, "styles.css": mutate(r), "app.js": mutate(r) };
    const once = fixOutput(files, i % 2 ? "site" : "app");
    const twice = fixOutput(once.files, i % 2 ? "site" : "app");
    assert.deepEqual(twice.files, once.files, `case ${i}: fixOutput changed fixed output`);
    const report = checkOutput(once.files, i % 2 ? "site" : "app");
    assert.ok(report.total > 20 && report.items.every((it) => typeof it.ok === "boolean"));
    const cleaned = cleanAppHtml(files["index.html"]).html;
    assert.doesNotMatch(cleaned, /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i, `case ${i}: inline script survived cleanAppHtml`);
  }
});

test("upload scanner: 500 random byte strings under every type never throw", () => {
  const r = rng(3);
  const types = ["application/pdf", "image/png", "image/gif", "image/webp", "image/jpeg", "text/plain", "text/csv"];
  for (let i = 0; i < 500; i++) {
    const len = Math.floor(r() * 300);
    const b = Buffer.alloc(len);
    for (let j = 0; j < len; j++) b[j] = Math.floor(r() * 256);
    if (r() < 0.3) Buffer.from(FRAGMENTS[Math.floor(r() * FRAGMENTS.length)]).copy(b, Math.floor(r() * Math.max(1, len - 10)));
    const v = scanBytes(b, types[Math.floor(r() * types.length)]);
    assert.ok(typeof v.ok === "boolean");
  }
});
