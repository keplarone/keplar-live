import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WHOP_PIXEL_LOADER_SCRIPT, WHOP_PIXEL_OPTIONS_SCRIPT, WHOP_PIXEL_SCRIPT, whopPixelAllowed } from "../src/lib/whop-pixel";

// Whop's install snippet from https://docs.whop.com/developer/ads/pixel with the business id filled in. Pinned character for character.
const SNIPPET =
  '!function(w,d,s,u,n,a,b){if(w[n])return;a=w[n]={q:[],t:+new Date,s:[],o:u,track:function(){a.q.push([+new Date].concat([].slice.call(arguments)))},setScope:function(){a.s=[].slice.call(arguments).filter(function(x){return typeof x==="string"});a.q.push([+new Date,"setScope"].concat(a.s))},scope:function(){var c=[].slice.call(arguments);return{track:function(){a.q.push([+new Date].concat([].slice.call(arguments)).concat([{__scope:c}]))}}}};b=d.createElement(s);b.async=1;b.src=u+"/s.js";d.getElementsByTagName(s)[0].parentNode.insertBefore(b,d.getElementsByTagName(s)[0])}(window,document,"script","https://t.whop.tw","whop");whop.setScope("biz_z2gxvcmr06XrpI");whop.track("page");';

test("Whop Pixel snippet is unchanged and sends only the page view", () => {
  assert.equal(WHOP_PIXEL_SCRIPT, SNIPPET);
  assert.equal([...WHOP_PIXEL_SCRIPT.matchAll(/whop\.track\(/g)].length, 1);
  assert.match(WHOP_PIXEL_SCRIPT, /whop\.track\("page"\);$/, "no email, name or other traits are attached");
});

test("Whop Pixel loads on public pages, never on signed-in, checkout or form pages", () => {
  for (const ok of ["/overview", "/pricing", "/privacy", "/blogs/some-post", "/compare/x", "/vs", "/help", "/answers/abc", "/download", "/application"]) assert.equal(whopPixelAllowed(ok), true, ok);
  assert.equal(whopPixelAllowed("/"), false, "/ is the chat");
  for (const no of ["/app", "/app/create", "/admin", "/admin/seo", "/account", "/checkout", "/checkout/x", "/welcome", "/signin", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/two-factor", "/secure-account", "/contact", "/feedback", "/inquire", "/r/token", "/s/slug", "/sites/slug/draft", "/i/token", "/api/x", "/APP/x", "/app?x=1"]) assert.equal(whopPixelAllowed(no), false, no);
});

test("the root layout renders the pixel in <head>", () => {
  const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const head = /<head>([\s\S]*?)<\/head>/.exec(layout)?.[1] ?? "";
  assert.match(head, /<WhopPixel \/>/);
});

test("the pixel's automatic form-field capture is switched off before it starts", () => {
  assert.match(WHOP_PIXEL_OPTIONS_SCRIPT, /forms:false/);
  const comp = readFileSync(path.join(process.cwd(), "src/components/analytics/WhopPixel.tsx"), "utf8");
  assert.ok(comp.indexOf("WHOP_PIXEL_OPTIONS_SCRIPT }}") < comp.indexOf("WHOP_PIXEL_LOADER_SCRIPT }}"), "options script comes first");
});

test("a question typed into Try it now never travels in a soft navigation the pixel could report", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/growth/TryBox.tsx"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /router\.(push|replace)/);
  assert.match(src, /window\.location\.assign\(/);
});

test("the pixel runs after load + idle or at the first interaction, once, with the snippet untouched inside", () => {
  const L = WHOP_PIXEL_LOADER_SCRIPT;
  assert.ok(L.includes(SNIPPET), "snippet is embedded byte for byte");
  assert.equal(L.split(SNIPPET).length, 2, "embedded once");
  assert.equal([...L.matchAll(/whop\.track\(/g)].length, 1, "one page view call in the loader");
  assert.ok(L.indexOf("function go(){if(done)return;done=1;") !== -1 && L.indexOf(SNIPPET) > L.indexOf("done=1;"), "go() runs the snippet only after the once-guard");
  for (const e of ["pointerdown", "keydown", "scroll", "touchstart"]) assert.match(L, new RegExp(`"${e}"`), e);
  assert.match(L, /addEventListener\("load",later\)/);
  assert.match(L, /document\.readyState==="complete"/);
  assert.match(L, /requestIdleCallback\(go,\{timeout:3000\}\)/);
  assert.match(L, /setTimeout\(go,3500\)/, "fallback when requestIdleCallback is missing or the page stays busy");
  assert.match(L, /removeEventListener\(ev\[i\],go,true\)/, "interaction listeners are removed once it ran");
});

test("the pixel is not executed directly any more: the page gets the loader, not the bare snippet", () => {
  const comp = readFileSync(path.join(process.cwd(), "src/components/analytics/WhopPixel.tsx"), "utf8");
  assert.doesNotMatch(comp, /__html: WHOP_PIXEL_SCRIPT/);
});
