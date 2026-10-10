// Real-browser layout regression: node scripts/layout-e2e.mjs [baseUrl] [--signed-only]
// Checks, across the viewports people actually use (Windows 100/125/150% scaling, 1366x768 .. ultrawide, phone, 300% zoom):
//  - no horizontal overflow on key pages
//  - the home hero (headline, prompt, chips) is fully inside the first screen, never clipped
//  - pill buttons keep their label on one line (cookie banner, nav, sidebar, sign-in)
//  - the /app scroll area leaves room for the composer dock (last card never slides under it)
//  - SIGNED IN (needs the local e2e server, see scripts/e2e-server.sh, which has a dev outbox + in-memory Postgres; skipped against
//    a server without /dev/outbox such as production): a fresh onboarded Free account on /app shows the composer inside the
//    viewport and pinned to its bottom, the starter cards scroll above it without overlapping it, and the heading fits
import { chromium } from "playwright";
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) || "http://localhost:3112";
const SIGNED_ONLY = args.includes("--signed-only"); // just the signed-in /app checks (needs the local e2e server)
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };
const VPS = [[1366, 700, 1], [1920, 900, 1], [1100, 600, 1], [1366, 768, 1], [1536, 864, 1.25], [1280, 720, 1.5], [1920, 1080, 1], [2560, 1440, 1], [3440, 1440, 1], [390, 844, 3], [640, 360, 3], [960, 540, 2]];
const PAGES = ["/", "/pricing", "/download", "/agents", "/enterprise", "/signin", "/signup", "/app"];

for (const [w, h, dpr] of SIGNED_ONLY ? [] : VPS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500 });
  for (const path of PAGES) {
    const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "load" }).catch(() => {});
    await p.waitForTimeout(1400);
    const tag = `${w}x${h}@${dpr} ${path}`;
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      // a label wraps when ONE text node spans more than one line (icons and separate spans sit at different tops on purpose)
      const lines = (el) => {
        let max = 1;
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const tops = new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top / 6)));
          max = Math.max(max, tops.size);
        }
        return max;
      };
      const pills = [...document.querySelectorAll("button, a")].filter((e) => {
        const t = (e.textContent || "").trim();
        return e.offsetParent && t && t.length <= 24 && parseFloat(getComputedStyle(e).borderTopLeftRadius) >= 12 && e.getBoundingClientRect().width > 0 && !e.closest("[aria-hidden=true]");
      });
      const wrapped = pills.filter((e) => lines(e) > 1).map((e) => (e.textContent || "").trim().slice(0, 20));
      const hero = document.querySelector('[data-act="hero"]');
      let heroFit = null;
      if (hero) {
        const kids = [...hero.children].filter((k) => k.getBoundingClientRect().height > 0 && getComputedStyle(k).display !== "none");
        const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
        const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        heroFit = { top: Math.round(top), bottom: Math.round(bottom), scrolls: hero.scrollHeight > hero.clientHeight + 2, ih: innerHeight };
      }
      return { over: de.scrollWidth - innerWidth, wrapped, heroFit };
    });
    ok(r.over <= 1, `${tag}: no horizontal overflow (${r.over})`);
    ok(r.wrapped.length === 0, `${tag}: pill labels on one line${r.wrapped.length ? " -> " + r.wrapped.join(", ") : ""}`);
    if (r.heroFit) {
      const f = r.heroFit;
      ok((f.top >= -1 && f.bottom <= f.ih + 1) || (f.scrolls && f.ih <= 420), `${tag}: hero inside the first screen (top ${f.top}, bottom ${f.bottom}, viewport ${f.ih}${f.scrolls ? ", scrolls inside" : ""})`);
    }
    if (path === "/app") {
      const m = await p.evaluate(() => {
        const sc = document.querySelector('[class*="scroll"]');
        const ta = document.querySelector("textarea");
        if (!sc || !ta) return null;
        sc.scrollTop = sc.scrollHeight;
        const dock = ta.closest('[class*="dock"]') || ta;
        const last = Math.max(...[...sc.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom));
        return { gap: Math.round(dock.getBoundingClientRect().top - last) };
      });
      if (m) ok(m.gap >= 0, `${tag}: last content clears the composer dock (gap ${m.gap})`);
    }
    await p.close();
  }
  await ctx.close();
}

// ── long conversation: the last line is reachable above the composer (signed out, browser and desktop-app UA) ─────────────────────
const longMd = (n) => `## Section ${n}\n\n` + Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1} of section ${n}. Photosynthesis converts light energy into chemical energy stored in glucose, using water and carbon dioxide. `.repeat(3)).join("\n\n") + `\n\n- point one\n- point two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\`\`\`js\nconsole.log("block ${n}");\n\`\`\`\n\nThe last line of answer ${n}.`;
const longAnswer = (n) => ({ id: "a" + n, markdown: longMd(n), consensus: { level: "high", score: 0.9, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "All agree." }, models: [], sources: [], disagreements: [], verification: { mode: "cross-check", summary: "Checked.", checks: [], notes: [] }, reasoning: "How the answer was formed", capabilities: [], compute: { units: 1, level: "standard" }, durationMs: 1000 });
const longThread = { id: "t-long", title: "Long", projectId: null, createdAt: Date.now(), updatedAt: Date.now(), messages: [1, 2, 3, 4].flatMap((n) => [
  { id: "u" + n, role: "user", text: "Question " + n, attachments: [], modes: {}, createdAt: Date.now() },
  { id: "k" + n, role: "keplar", replyTo: "u" + n, status: "done", mode: "consensus", stages: [], capabilities: [], models: [], draft: "", answer: longAnswer(n), startedAt: Date.now(), finishedAt: Date.now() },
]) };
if (!SIGNED_ONLY) {
  const c0 = await b.newContext(); const pg0 = await c0.newPage(); const baseUa = await pg0.evaluate(() => navigator.userAgent); await c0.close();
  for (const desktop of [false, true]) {
    for (const [w, h, dpr] of [[1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1], [1280, 720, 1.5], [390, 844, 3]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500, ...(desktop ? { userAgent: baseUa + " keplar-desktop/1.0" } : {}) });
      await ctx.addInitScript(([t]) => { if (!localStorage.getItem("keplar.anon.v2")) localStorage.setItem("keplar.anon.v2", JSON.stringify({ threads: [t], activeThreadId: t.id })); }, [longThread]);
      const p = await ctx.newPage();
      const tag = `long thread ${w}x${h}@${dpr}${desktop ? " desktop-app" : ""}`;
      try {
        await p.goto(base + "/app", { waitUntil: "load" });
        await p.waitForSelector("textarea", { timeout: 20000 });
        await p.getByRole("button", { name: /Accept all/ }).click({ timeout: 1500 }).catch(() => {});
        if (desktop) await p.addStyleTag({ content: ":is(a,button,input,textarea,select,summary,label,[role=button]) { -webkit-app-region: no-drag; position: relative; z-index: 2; }" }); // what keplar-desktop <= 0.1.3 injects
        await p.waitForSelector("text=The last line of answer 4.", { timeout: 20000 });
        // open every disclosure in the newest answer: the bottom must stay reachable as it grows
        await p.evaluate(() => { const sc = document.querySelector('[class*="scroll"]'); sc.scrollTop = sc.scrollHeight; for (const el of [...sc.querySelectorAll('[aria-expanded="false"]')].slice(-8)) el.click(); });
        if (w >= 500) { await p.mouse.move(w / 2, h / 2); for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 4000); await p.waitForTimeout(80); } }
        else await p.evaluate(() => { const sc = document.querySelector('[class*="scroll"]'); sc.scrollTop = sc.scrollHeight; });
        await p.waitForTimeout(500);
        const m = await p.evaluate(() => {
          const sc = document.querySelector('[class*="scroll"]');
          const dock = document.querySelector('[class*="dock"]').getBoundingClientRect();
          const lowest = Math.max(...[...sc.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0 && r.width > 0).map((r) => r.bottom));
          const line = [...sc.querySelectorAll("p")].filter((e) => /The last line of answer 4\./.test(e.textContent)).pop()?.getBoundingClientRect();
          return { atEnd: sc.scrollHeight - sc.scrollTop - sc.clientHeight, gap: dock.top - lowest, lineVisible: !!line && line.top >= 0 && line.bottom <= dock.top, ih: innerHeight };
        });
        ok(m.atEnd <= 2, `${tag}: scrolled to the very end (${Math.round(m.atEnd)}px left)`);
        ok(m.gap >= 4, `${tag}: the last element of the conversation sits above the composer (gap ${Math.round(m.gap)})`);
      } catch (e) {
        ok(false, `${tag}: ${e.message}`);
      }
      await ctx.close();
    }
  }
}

// ── signed in: fresh onboarded Free account on /app ──────────────────────────────────────────────────────────────────────────────
async function signIn(ctx, email, name) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const r1 = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } });
  if (!r1.ok()) throw new Error("magic link " + r1.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  if (!link) throw new Error("no sign-in link in /dev/outbox");
  const r2 = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  if (!r2.ok()) throw new Error("confirm " + r2.status());
  const r3 = await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name } } });
  if (!r3.ok()) throw new Error("onboarding " + r3.status());
}

const SIGNED = [[1366, 768, 1], [1536, 864, 1], [1920, 1080, 1], [1536, 864, 1.25], [1280, 720, 1.5], [1366, 768, 1.25], [1100, 600, 1], [2560, 1440, 1], [390, 844, 3], [640, 360, 2]];
const DESKTOP_UA = " keplar-desktop/1.0";
const baseUA = await (async () => { const c = await b.newContext(); const pg = await c.newPage(); const ua = await pg.evaluate(() => navigator.userAgent); await c.close(); return ua; })();
const outbox = await fetch(base + "/dev/outbox").then((r) => r.status).catch(() => 0);
if (outbox !== 200) console.log(`skip signed-in /app checks (no /dev/outbox on ${base}: start scripts/e2e-server.sh to run them)`);
else {
  const stamp = Date.now() % 1e6;
  let n = 0;
  for (const desktop of [false, true]) {
    for (const [w, h, dpr] of SIGNED) {
      if (desktop && !(w === 1366 || w === 1920)) continue;
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500, ...(desktop ? { userAgent: baseUA + DESKTOP_UA } : {}) });
      const tag = `signed-in ${w}x${h}@${dpr}${desktop ? " desktop-app" : ""}`;
      try {
        await signIn(ctx, `layout${stamp}x${n++}@example.com`, "Alex Rivera");
        const p = await ctx.newPage();
        await p.goto(base + "/app", { waitUntil: "load" });
        await p.waitForSelector("textarea", { timeout: 20000 }).catch(() => {});
        await p.waitForSelector("#ob-first-h", { timeout: 20000 }).catch(() => {});
        await p.waitForTimeout(800);
        const m = await p.evaluate(() => {
          const ih = innerHeight, iw = innerWidth;
          const q = (sel) => document.querySelector(sel);
          const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
          const ta = q("textarea"), tr = R(ta);
          const dockEl = ta?.closest('[class*="dock"]'), dock = R(dockEl);
          const sc = q('[class*="scroll"]');
          const card = q('[data-testid="app-onboarding"]') || q("#ob-first-h")?.closest("section");
          const head = q("#ob-first-h");
          let covered = true;
          if (tr) { const el = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2); covered = !(el === ta || (el && dockEl && dockEl.contains(el))); }
          const starters = card ? [...card.querySelectorAll('ul[aria-label="Suggested first questions"] > li')] : [];
          const cards = starters.map((li) => ({ r: R(li), clipX: li.scrollWidth - li.clientWidth, clipY: li.scrollHeight - li.clientHeight, btn: (() => { const bt = li.querySelector("button"); return bt.scrollHeight - bt.clientHeight; })() }));
          // scroll to the end, then measure the lowest thing in the scroller against the dock
          if (sc) sc.scrollTop = sc.scrollHeight;
          const lowest = sc ? Math.max(...[...sc.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0 && r.width > 0).map((r) => r.bottom)) : 0;
          const after = cards.length ? starters.map((li) => R(li)) : [];
          const overlap = after.some((a, i) => after.some((b2, j) => j > i && a.left < b2.right - 1 && b2.left < a.right - 1 && a.top < b2.bottom - 1 && b2.top < a.bottom - 1));
          const hr = R(head), lh = head ? parseFloat(getComputedStyle(head).lineHeight) || 20 : 20;
          const body = document.body.innerText;
          return {
            ih, iw, ta: tr, dock, app: R(q('[class*="app"]')), docOver: document.documentElement.scrollHeight - ih, hOver: document.documentElement.scrollWidth - iw, covered,
            lowestGap: dock ? dock.top - lowest : null, cards, overlap, head: hr && { w: hr.width, h: hr.height, lines: Math.round(hr.height / lh), clipX: head.scrollWidth - head.clientWidth, text: head.textContent, right: hr.right },
            brit: /neighbourhood|colour\b|favourite|behaviour/i.test(body), scrollCover: sc ? sc.getBoundingClientRect().bottom : 0,
          };
        });
        const near = (a, b2, t = 1.5) => Math.abs(a - b2) <= t;
        ok(!!m.ta && m.ta.width > 40 && m.ta.height > 10, `${tag}: composer textarea is rendered`);
        if (m.ta) {
          ok(m.ta.top >= 0 && m.ta.bottom <= m.ih + 0.5 && m.ta.left >= 0 && m.ta.right <= m.iw + 0.5, `${tag}: composer fully inside the viewport (top ${Math.round(m.ta.top)}, bottom ${Math.round(m.ta.bottom)} of ${m.ih})`);
          ok(!m.covered, `${tag}: nothing covers the composer`);
        }
        ok(!!m.dock && near(m.dock.bottom, m.ih, 2), `${tag}: composer dock pinned to the bottom of the viewport (dock bottom ${m.dock ? Math.round(m.dock.bottom) : "?"}, viewport ${m.ih})`);
        ok(m.app && near(m.app.top, 0) && near(m.app.bottom, m.ih, 2), `${tag}: app shell is exactly one viewport tall`);
        ok(m.docOver <= 1 && m.hOver <= 1, `${tag}: the page itself does not scroll (v ${m.docOver}, h ${m.hOver})`);
        ok(m.lowestGap !== null && m.lowestGap >= 8, `${tag}: with the list scrolled to its end, the last card/footer clears the dock (gap ${m.lowestGap === null ? "?" : Math.round(m.lowestGap)})`);
        ok(!!m.head, `${tag}: "try your first question" heading is shown`);
        if (m.head) {
          ok(m.head.clipX <= 1 && m.head.right <= m.iw + 0.5 && m.head.lines <= 2, `${tag}: heading fits (${m.head.lines} line${m.head.lines === 1 ? "" : "s"}, "${m.head.text}")`);
          ok(/^Alex, /.test(m.head.text), `${tag}: greeting uses the first name only`);
        }
        ok(m.cards.length >= 3, `${tag}: ${m.cards.length} starter cards`);
        ok(m.cards.every((c) => c.clipX <= 1 && c.clipY <= 1 && c.btn <= 1 && c.r.height >= 40), `${tag}: starter cards not clipped (heights ${m.cards.map((c) => Math.round(c.r.height)).join("/")})`);
        ok(m.cards.every((c) => c.r.left >= 0 && c.r.right <= m.iw + 0.5), `${tag}: starter cards inside the viewport width`);
        ok(!m.overlap, `${tag}: starter cards do not overlap each other`);
        ok(!m.brit, `${tag}: no British spellings in the visible copy`);
        // scroll back and make sure the first card is reachable above the dock too
        await p.evaluate(() => { const sc = document.querySelector('[class*="scroll"]'); if (sc) sc.scrollTop = 0; });
        await p.close();
      } catch (e) {
        ok(false, `${tag}: ${e.message}`);
      }
      await ctx.close();
    }
  }
}
await b.close();
process.exit(bad ? 1 : 0);
