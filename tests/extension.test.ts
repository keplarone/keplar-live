import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
// @ts-expect-error plain ES module build script, no types
import { ALLOWED_PERMISSIONS, SHIPPED, buildExtension, validateExtension, zip } from "../scripts/build-extension.mjs";
// @ts-expect-error plain ES module shared with the popup
import { ASK_URL, MAX_QUESTION, composeQuestion, cropRect, describeAnswer, errorText, hostOf, looksLikeKey, parseSse, textInRect } from "../extension/lib.js";
import { openApiSpec } from "../src/lib/api/openapi";

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const copy = () => { const d = mkdtempSync(join(tmpdir(), "kext-")); cpSync("extension", d, { recursive: true, filter: (s) => !s.includes("dist") }); return d; };

test("manifest: MV3, named Keplar One, minimal permissions, no host access, no content scripts, strict CSP", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Keplar One");
  assert.ok(!/beta/i.test(JSON.stringify(manifest)), "no beta label anywhere in the manifest");
  assert.deepEqual([...manifest.permissions].sort(), [...ALLOWED_PERMISSIONS].sort());
  for (const banned of ["tabs", "cookies", "webRequest", "history", "<all_urls>", "clipboardRead", "downloads", "identity"]) assert.ok(!manifest.permissions.includes(banned), banned);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  const csp = manifest.content_security_policy.extension_pages as string;
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src https:\/\/keplar\.one(;|$)/);
  assert.ok(!/unsafe-|\*/.test(csp));
});

test("the shipped files pass the validator, and the validator catches the things it exists to catch", () => {
  assert.deepEqual(validateExtension(), []);
  const mutate = (file: string, fn: (s: string) => string) => { const d = copy(); writeFileSync(join(d, file), fn(readFileSync(join(d, file), "utf8"))); return validateExtension(d); };
  assert.ok(mutate("manifest.json", (s) => s.replace('"storage"', '"storage", "tabs"')).some((p: string) => /allow-list/.test(p)));
  assert.ok(mutate("manifest.json", (s) => s.replace('"permissions"', '"host_permissions": ["https://*/*"], "permissions"')).some((p: string) => /host permissions/.test(p)));
  assert.ok(mutate("manifest.json", (s) => s.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")).some((p: string) => /CSP/.test(p)));
  assert.ok(mutate("manifest.json", (s) => s.replace("connect-src https://keplar.one", "connect-src https://keplar.one https://evil.example")).some((p: string) => /origin/.test(p)));
  assert.ok(mutate("popup.js", (s) => s + "\neval('1')").some((p: string) => /eval/.test(p)));
  assert.ok(mutate("popup.js", (s) => s + "\nel.innerHTML = x;").some((p: string) => /HTML/.test(p)));
  assert.ok(mutate("popup.js", (s) => s + "\nfetch('https://tracker.example/x')").some((p: string) => /unexpected URL/.test(p)));
  assert.ok(mutate("popup.html", (s) => s.replace("popup.js", "https://cdn.example/x.js")).some((p: string) => /remote script/.test(p)));
  assert.ok(mutate("popup.js", (s) => s + "\nlocalStorage.setItem('q', 1)").some((p: string) => /storage/.test(p)));
});

test("build writes a valid zip with exactly the shipped files and a readable manifest", () => {
  const r = buildExtension();
  assert.ok(existsSync(r.out) && r.out.endsWith("keplar-extension-0.1.0.zip"));
  const listing = execFileSync("unzip", ["-Z1", r.out]).toString().trim().split("\n").sort();
  assert.deepEqual(listing, [...SHIPPED].sort());
  execFileSync("unzip", ["-tq", r.out]); // integrity check (CRC)
  const m = JSON.parse(execFileSync("unzip", ["-p", r.out, "manifest.json"]).toString());
  assert.equal(m.version_name, manifest.version_name);
  assert.ok(r.bytes < 100_000, "small package");
  assert.deepEqual(zip([{ name: "a", data: Buffer.from("x") }]), zip([{ name: "a", data: Buffer.from("x") }]), "deterministic");
});

test("the extension calls an endpoint the OpenAPI spec documents, with the documented scope and fields", () => {
  const u = new URL(ASK_URL);
  assert.equal(u.origin, "https://keplar.one");
  assert.ok(openApiSpec().paths[u.pathname as "/api/v1/ask"]);
  const popup = readFileSync("extension/popup.js", "utf8");
  assert.match(popup, /authorization: `Bearer \$\{key\}`/);
  assert.match(popup, /credentials: "omit"/, "never sends cookies");
  assert.ok(!/chrome\.cookies|document\.cookie/.test(popup));
});

test("composeQuestion: keeps the person's words, labels context by host only, and never exceeds the API limit", () => {
  const q = composeQuestion({ ask: "Is this true?", context: "Some claim.", kind: "selection", url: "https://example.com/a/b?token=SECRET#frag" });
  assert.match(q.question, /^Is this true\?/);
  assert.match(q.question, /Selected text from example\.com ---/);
  assert.ok(!q.question.includes("SECRET") && !q.question.includes("/a/b"), "no path, query or fragment");
  assert.equal(q.truncated, false);
  const big = composeQuestion({ ask: "Summarize", context: "x".repeat(50_000), kind: "page", url: "https://example.com" });
  assert.ok(big.question.length <= MAX_QUESTION);
  assert.equal(big.truncated, true);
  assert.deepEqual(composeQuestion({ ask: "  ", context: "", kind: "selection", url: "" }), { question: "", truncated: false });
  assert.match(composeQuestion({ ask: "", context: "text", kind: "page", url: "" }).question, /^Summarize this page/);
  const region = composeQuestion({ ask: "", context: "Hello there", kind: "region", url: "https://news.example/path?q=1#x" });
  assert.match(region.question, /^Explain this and say what is uncertain/);
  assert.match(region.question, /Text in the area you dragged from news\.example/);
  assert.ok(!region.question.includes("/path") && !region.question.includes("q=1"));
  assert.equal(hostOf("chrome://extensions"), "");
  assert.equal(hostOf("javascript:alert(1)"), "");
});

test("textInRect reads intersecting words in order, and cropRect maps the drag onto the screenshot", () => {
  const rect = { left: 10, top: 10, width: 80, height: 40 };
  const words = textInRect([
    { text: "outside", left: 0, top: 0, right: 8, bottom: 8 },
    { text: "Hello", left: 12, top: 12, right: 40, bottom: 24 },
    { text: "there", left: 44, top: 14, right: 70, bottom: 24 },
    { text: "Next", left: 12, top: 40, right: 40, bottom: 52 },
  ], rect);
  assert.equal(words, "Hello there\nNext");
  assert.equal(textInRect([], rect), "");
  assert.equal(cropRect({ left: 0, top: 0, width: 1, height: 40 }, { w: 200, h: 100 }, 400, 200), null);
  assert.deepEqual(cropRect({ left: 10, top: 20, width: 50, height: 40 }, { w: 100, h: 100 }, 200, 200), { x: 20, y: 40, w: 100, h: 80 });
  assert.deepEqual(cropRect({ left: -20, top: 10, width: 50, height: 20 }, { w: 100, h: 80 }, 100, 80), { x: 0, y: 10, w: 30, h: 20 });
  assert.equal(cropRect({ left: 0, top: 0, width: 10, height: 10 }, { w: 0, h: 10 }, 10, 10), null);
});

test("the lens overlay is packaged, sends words only, and does not phone home on its own", () => {
  const lens = readFileSync("extension/lens.js", "utf8");
  const bg = readFileSync("extension/background.js", "utf8");
  assert.match(lens, /Drag to search/);
  assert.match(lens, /Ask anything/);
  assert.match(lens, /Click to exit/);
  assert.match(lens, /type: "ask", ask, context, kind, url: location\.href/);
  assert.match(lens, /lensPorts|keplar-lens/);
  assert.match(readFileSync("extension/background.js", "utf8"), /const lensPorts = new Set/);
  assert.doesNotMatch(lens, /https?:\/\//);
  assert.match(bg, /Search this tab with Keplar One/);
  assert.match(bg, /files:\s*\["lens\.js"\]/);
  assert.match(bg, /body: JSON\.stringify\(\{ question, stream: true \}\)/);
  assert.doesNotMatch(bg, /body: JSON\.stringify\(\{[^}]*dataUrl/);
  assert.match(readFileSync("extension/popup.js", "utf8"), /keplar-lens-open/);
  // The popup and the overlay use keplar.one's own theme tokens (light by default, dark with the browser), read from the site's CSS.
  const popupCss = readFileSync("extension/popup.css", "utf8");
  const token = (file: string, name: string, block = ":root") => { const css = readFileSync(file, "utf8"); const at = css.indexOf(block); return new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css.slice(at))![1]!.toLowerCase(); };
  const light = { canvas: token("src/styles/light.css", "c-canvas"), ink: token("src/styles/light.css", "c-ink"), ink2: token("src/styles/light.css", "c-ink-2") };
  const dark = { canvas: token("src/styles/tokens.css", "c-canvas", ':root[data-theme="dark"]'), panel: token("src/styles/tokens.css", "c-surface-1", ':root[data-theme="dark"]'), ink: token("src/styles/tokens.css", "c-ink", ':root[data-theme="dark"]') };
  for (const v of [...Object.values(light), ...Object.values(dark)]) {
    assert.ok(popupCss.toLowerCase().includes(v), `popup uses the site's ${v}`);
    assert.ok(lens.toLowerCase().includes(v), `overlay uses the site's ${v}`);
  }
  assert.match(popupCss, /border-radius: 999px/, "pill buttons like the site");
  assert.doesNotMatch(popupCss, /#8fb4ff|#faf9f7|#2c241e/, "no leftovers of the old palette");
  assert.match(lens, /data-keplar/);
  assert.match(lens, /prefers-color-scheme: dark/, "the overlay follows the browser's light or dark mode");
  assert.match(readFileSync("src/components/legal/content/privacy.ts", "utf8"), /picture stays on your device/);
});

test("keys and SSE parsing", () => {
  assert.ok(looksLikeKey("kpl_" + "a".repeat(32)));
  assert.ok(!looksLikeKey("kpl_short") && !looksLikeKey("sk-" + "a".repeat(40)) && !looksLikeKey(undefined));
  const first = parseSse('event: progress\ndata: {"stage":"comparing"}\n\nevent: ans');
  assert.deepEqual(first.events, [{ event: "progress", data: { stage: "comparing" } }]);
  const second = parseSse(first.rest + 'wer\ndata: {"object":"answer"}\n\nevent: done\ndata: {}\n\nevent: bad\ndata: {nope\n\n');
  assert.deepEqual(second.events.map((e: { event: string }) => e.event), ["answer", "done"]);
  assert.equal(second.rest, "");
});

test("answers render as Markdown blocks built from text: Keplar's one-point-per-line answers, bold, lists, code; never HTML", async () => {
  const { markdownBlocks, describeAnswer } = await import("../extension/lib.js");
  const real = JSON.parse(readFileSync("extension/store/sample-answer.json", "utf8")).answer;
  const blocks = markdownBlocks(real.answer);
  assert.equal(blocks[0].type, "p");
  assert.ok(blocks.length >= 6, "each hard-broken line is its own block");
  const bias = blocks.find((b: { parts: { text: string }[] }) => b.parts.some((p) => p.text === "Self-selection bias"));
  assert.ok(bias && bias.parts[0].bold === true, "**bold** leads become bold parts");
  assert.ok(!JSON.stringify(blocks).includes("**"), "no raw Markdown markers left");
  assert.deepEqual(markdownBlocks("Intro\n\n- one\n- **two**\n1. three\n\n```lua\nprint(1)\n```\n## Next\nuse `x` and *y*").map((b: { type: string }) => b.type), ["p", "li", "li", "li", "code", "h", "p"]);
  assert.deepEqual(markdownBlocks("<img src=x onerror=alert(1)> **b**")[0].parts, [{ text: "<img src=x onerror=alert(1)> " }, { text: "b", bold: true }], "markup stays text");
  assert.ok(Array.isArray(describeAnswer(real).blocks));
  assert.equal(describeAnswer(real).meta, "2 models consulted. 1 credit. Answers can be wrong; agreement isn't proof.", "the API's consulted count (a stand-in is listed twice in models) and singular credit");
  assert.match(describeAnswer({ answer: "x", usage: { credits: 3 }, models: [{ name: "A" }] }).meta, /^1 model consulted\. 3 credits\./);
  for (const f of ["extension/popup.js", "extension/lens.js"]) assert.match(readFileSync(f, "utf8"), /renderBlocks\(/, f);
});

test("describeAnswer and errorText handle the v1 shapes", () => {
  const d = describeAnswer({ answer: "A", agreement: { summary: "3 of 4 agreed" }, disagreement: { headline: "Split on timing", positions: [{ count: 3, of: 4, summary: "Wait", stance: "wait" }, { count: 1, of: 4, summary: "", stance: "Go now" }] }, models: [{ name: "M1" }], usage: { credits: 7 } });
  assert.deepEqual(d.positions, ["3 of 4: Wait", "1 of 4: Go now"]);
  assert.equal(d.credits, 7);
  assert.equal(describeAnswer({ answer: "A", disagreement: null }).headline, "");
  assert.match(errorText(401, null), /revoked or expired/);
  assert.equal(errorText(402, { error: { message: "Used up; resets Friday." } }), "Used up; resets Friday.");
  assert.match(errorText(429, { error: { message: "Slow." } }), /Slow\. Try again/);
});

test("store listing and README exist, say Keplar One, and nothing was submitted", () => {
  const listing = readFileSync("extension/STORE_LISTING.md", "utf8");
  assert.match(listing, /ready to submit/i);
  assert.match(listing, /NOT submitted/i);
  for (const f of ["screenshot-1-answer.png", "screenshot-2-page-text.png", "screenshot-3-setup.png", "promo-small.png", "promo-marquee.png"]) assert.ok(existsSync(`extension/store/${f}`) && listing.includes(f), f);
  const png = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(png("extension/store/screenshot-1-answer.png"), [1280, 800]);
  assert.deepEqual(png("extension/store/promo-small.png"), [440, 280]);
  assert.deepEqual(png("extension/store/promo-marquee.png"), [1400, 560]);
  assert.deepEqual(png("extension/icons/icon128.png"), [128, 128]);
  assert.match(listing, /Remote code:\*\* No/);
  assert.match(listing, /Keplar One/);
  assert.ok(!/\(beta\)|0\.1\.0-beta/i.test(listing), "the old beta name is gone");
  for (const p of manifest.permissions) assert.ok(listing.includes(`\`${p}\``), `justification for ${p}`);
  assert.ok(!/\b(best|most accurate|always right|guaranteed)\b/i.test(listing), "no inflated claims");
  assert.match(readFileSync("extension/README.md", "utf8"), /Keplar One/);
});
