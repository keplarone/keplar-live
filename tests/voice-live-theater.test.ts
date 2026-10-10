/**
 * Voice Live Create theater fixes: highlightLine escaping order, the editor following the file being written, the tab strip and
 * the desktop layout rule in the studio stylesheet.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { highlightLine, theaterFromTranscript } from "@/lib/create/voice-live";

/** What the browser shows for highlightLine's HTML: our spans removed, entities decoded once. */
const visible = (html: string) =>
  html.replace(/<span class="k-[a-z]+">|<\/span>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
/** Every tag in the output must be one of ours. */
const foreignTags = (html: string) => (html.match(/<[^>]*>/g) ?? []).filter((t) => !/^<span class="k-(kw|str|num|cmt|key|sel|val)">$|^<\/span>$/.test(t));

const BRIEF = "a yoga studio booking app with a class schedule, teachers, my practice and an admin desk";

test("highlightLine: every theater line renders exactly as written (no &quot; on screen, no class=\"k-kw\"> artifacts)", () => {
  for (const tick of [0, 40, 80, 120, 160, 200, 240]) {
    for (const f of theaterFromTranscript(BRIEF, { tick }).files) {
      for (const line of f.content.split("\n")) {
        const html = highlightLine(line, f.language);
        assert.equal(visible(html), line, `${f.path}: ${line}`);
        assert.deepEqual(foreignTags(html), [], `${f.path}: ${html}`);
        assert.doesNotMatch(html, /&amp;(quot|lt|gt|amp|#39);/, `double-escaped: ${html}`);
      }
    }
  }
});

test("highlightLine JS: keywords, strings, numbers and comments, and markup never re-matched", () => {
  const html = highlightLine(`export async function Home(root) { const rows = await db.list("records", { limit: 24 }); // h1 item2`, "js");
  assert.match(html, /<span class="k-kw">export<\/span> <span class="k-kw">async<\/span> <span class="k-kw">function<\/span>/);
  assert.match(html, /<span class="k-str">&quot;records&quot;<\/span>/);
  assert.match(html, /<span class="k-num">24<\/span>/);
  assert.match(html, /<span class="k-cmt">\/\/ h1 item2<\/span>/, "the comment is one token; nothing inside it is highlighted again");
  assert.doesNotMatch(html, /"k-kw"&gt;|<span class="k-str">"k-/, "the old bug: the string rule matched our own class attribute");
  assert.equal(highlightLine(`const h1 = item2;`, "js"), `<span class="k-kw">const</span> h1 = item2;`, "digits inside identifiers are not numbers");
  assert.match(highlightLine(`const url = "http://x.test"; // ok`, "js"), /<span class="k-str">&quot;http:\/\/x\.test&quot;<\/span>; <span class="k-cmt">\/\/ ok<\/span>/, "// inside a string is not a comment");
});

test("highlightLine CSS: quotes render as quotes, selectors and values are marked", () => {
  const html = highlightLine(`  --font: "Google Sans", system-ui, sans-serif;`, "css");
  assert.equal(html, `  --font: <span class="k-val">&quot;Google Sans&quot;, system-ui, sans-serif</span>;`);
  assert.equal(visible(html), `  --font: "Google Sans", system-ui, sans-serif;`);
  assert.equal(highlightLine(`.card h2 { margin: 0 0 4px; }`, "css"), `.card <span class="k-sel">h2</span> { margin: <span class="k-val">0 0 4px</span>; }`);
  assert.equal(highlightLine(`:root {`, "css"), `<span class="k-sel">:root</span> {`);
  assert.equal(highlightLine(`/* tokens */`, "css"), `<span class="k-cmt">/* tokens */</span>`);
});

test("highlightLine JSON and Markdown", () => {
  assert.equal(highlightLine(`  "name": "prana-&-clay",`, "json"), `  <span class="k-key">&quot;name&quot;</span>: <span class="k-str">&quot;prana-&amp;-clay&quot;</span>,`);
  assert.equal(highlightLine(`# Prana & Clay <b>`, "md"), `# Prana &amp; Clay &lt;b&gt;`);
});

test("highlightLine output is safe for innerHTML: hostile source cannot open a tag or break out of an attribute", () => {
  const hostile = [
    `<img src=x onerror="alert(1)"> // </span><script>alert(2)</script>`,
    `const s = "</span><script>alert(3)</script>";`,
    `.x { background: url("javascript:alert(4)"); } /* </span><svg onload=alert(5)> */`,
    `"<k>": "\\"</span><iframe>"`,
    `'it''s' \`<b>\${"x"}</b>\``,
  ];
  for (const lang of ["js", "css", "json", "md", "html"] as const) {
    for (const line of hostile) {
      const html = highlightLine(line, lang);
      assert.deepEqual(foreignTags(html), [], `${lang}: ${html}`);
      assert.equal(visible(html), line, `${lang}: round trip`);
    }
  }
});

test("the writer moves through the files as the transcript is spoken (the editor has something to follow)", () => {
  const seen = new Set<string>();
  for (let tick = 0; tick < 400; tick += 10) seen.add(theaterFromTranscript(BRIEF, { tick }).activePath);
  assert.ok(seen.size >= 4, [...seen].join(", "));
});

test("theater follows the file being written; a clicked tab only pins until the writer moves on", () => {
  const src = readFileSync("src/components/create/apps/VoiceLiveTheater.tsx", "utf8");
  assert.doesNotMatch(src, /setActivePath\(\(p\) => p && next\.files\.some/, "the old sticky first-file state is gone");
  assert.match(src, /const activePath = pinned && pinned\.writer === frame\.activePath \? pinned\.path : frame\.activePath;/);
  assert.match(src, /setPinned\(\(p\) => \(p && p\.writer === next\.activePath/);
  assert.match(src, /aria-selected=\{f\.path === activePath\}/, "tabs expose the selected file to assistive tech");
  assert.match(src, /data-voice-stage=""/);
});

test("tab strip: one scrolling row, tabs keep their width and truncate with an ellipsis", () => {
  const css = readFileSync("src/components/create/apps/VoiceLiveTheater.module.css", "utf8");
  const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.[\]]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  assert.match(rule(".tabs"), /min-width: 0/);
  assert.match(rule(".tabs"), /overflow-x: auto/);
  assert.match(rule(".tabs"), /flex: 1 1 0/);
  assert.match(rule(".tab"), /flex: none/);
  assert.match(rule(".tab"), /text-overflow: ellipsis/);
  assert.match(rule(".tab"), /overflow: hidden/);
  assert.match(rule(".tab"), /max-width: 18ch/);
  assert.match(rule(".paneTitle"), /flex: none/);
});

test("desktop rule: the studio matches the open theater by data attribute (a class from another CSS module never matches)", () => {
  const css = readFileSync("src/components/create/apps/studio.module.css", "utf8");
  assert.doesNotMatch(css, /:has\([^)]*\[data-voice-live\] \.stage\)/, "the old selector hashed .stage for studio.module.css");
  assert.match(css, /@media \(min-width: 900px\) \{\s*\.desk:has\(\.voiceLive \[data-voice-live\] \[data-voice-stage\]\) \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.desk:has\(\.voiceLive \[data-voice-live\] \[data-voice-stage\]\) > \.canvas \{ display: none; \}/);
});
