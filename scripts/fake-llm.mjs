// A tiny OpenAI-compatible server for local browser tests of Create. It is a test double, never used in production:
//   node scripts/fake-llm.mjs 4799   then start Keplar with  OPENROUTER_API_KEY=test KEPLAR_OPENROUTER_BASE=http://127.0.0.1:4799/v1
// Streaming requests (the site builder) get a three-page bakery site; JSON requests get a plain improved description or a visual review.
import http from "node:http";

const css = `:root{--ink:#1d1a16;--paper:#f6f0e6;--rust:#b4532a}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 "Newsreader",Georgia,serif}
.kt-top{display:flex;justify-content:space-between;align-items:baseline;padding:22px 5vw;border-bottom:2px solid var(--ink)}.kt-top a{color:inherit;margin-left:20px;text-decoration:none}
h1{font-family:"Fraunces",Georgia,serif;font-size:clamp(2.6rem,8vw,6rem);line-height:.95;margin:0 0 18px;max-width:12ch}h2{font-size:1.9rem;margin:0 0 10px}
.kt-hero{padding:9vh 5vw 7vh;display:grid;grid-template-columns:1.4fr 1fr;gap:5vw;align-items:end}.kt-hero p{max-width:40ch}
.kt-board{background:var(--ink);color:var(--paper);padding:28px;border-radius:2px}.kt-board dt{opacity:.7;margin-top:10px}.kt-board dd{margin:0;font-size:1.3rem}
.kt-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0;border-top:2px solid var(--ink)}.kt-row>div{padding:26px 5vw;border-right:1px solid var(--ink)}
.kt-btn{display:inline-block;background:var(--rust);color:#fff;padding:12px 22px;text-decoration:none;border:0;font:inherit}form{display:grid;gap:12px;max-width:460px;padding:6vh 5vw}label{display:grid;gap:4px}input,textarea{font:inherit;padding:10px;border:2px solid var(--ink);background:#fff}
footer{padding:30px 5vw;border-top:2px solid var(--ink)}@media(max-width:700px){.kt-hero{grid-template-columns:1fr}.kt-top{flex-direction:column;gap:6px}}`;
const nav = `<header class="kt-top"><strong>Mill Lane Bakehouse</strong><nav><a href="index.html">Bakes</a><a href="menu.html">Menu</a><a href="contact.html">Find us</a></nav></header>`;
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="Naturally leavened bread baked at Mill Lane from 4 a.m."><link rel="stylesheet" href="styles.css"></head><body>${nav}<main id="main">${body}</main><footer><small>Mill Lane Bakehouse. Hours and prices on this page are placeholders until you add yours.</small></footer></body></html>`;
const files = {
  "index.html": shell("Mill Lane Bakehouse", `<section class="kt-hero"><div><h1>Bread, before the street wakes</h1><p>Rye, seeded and white loaves, shaped by hand and out of the oven by seven.</p><a class="kt-btn" href="menu.html">See what is baking</a></div><dl class="kt-board"><dt>Tuesday to Friday</dt><dd>7 to 2</dd><dt>Saturday</dt><dd>7 to noon</dd><dt>Sunday</dt><dd>Resting</dd></dl></section><section class="kt-row"><div><h2>The 4 a.m. rye</h2><p>Dark, sour and slow, the loaf the regulars ask for first.</p></div><div><h2>Seeded batch</h2><p>Sunflower, poppy and linseed.</p></div></section>`),
  "menu.html": shell("Menu - Mill Lane Bakehouse", `<section class="kt-hero"><div><h1>What is baking</h1><p>The list changes with the flour. Prices are placeholders until you add yours.</p></div></section><section class="kt-row"><div><h2>Loaves</h2><p>Rye, seeded, white.</p></div><div><h2>Pastry</h2><p>Morning buns, cardamom twists.</p></div></section>`),
  "contact.html": shell("Find us - Mill Lane Bakehouse", `<section class="kt-hero"><div><h1>Find us on Mill Lane</h1><p>Walk in, or send a note to reserve a loaf.</p></div></section><form method="post" action="#"><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Message<textarea name="message" rows="4"></textarea></label><button class="kt-btn" type="submit">Send</button></form>`),
  "styles.css": css,
};
const reply = (res, obj) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", async () => {
    let j = {};
    try { j = JSON.parse(b); } catch { /* not json */ }
    const text = JSON.stringify(j.messages ?? "");
    const lastUser = JSON.stringify((j.messages ?? []).filter((m) => m.role === "user").slice(-1)[0]?.content ?? "");
    if (j.stream && /book a 30 minute call|data-k-feature=\\*"booking/.test(lastUser)) { // the repair pass that follows an edit sees the placeholders in the current files and must keep them
      // Test double for "Add a booking section...": the page gets the placeholders a real model would write (see the REAL FEATURES prompt).
      const page = shell("Find us - Mill Lane Bakehouse", `<section class="kt-hero"><div><h1>Find us on Mill Lane</h1><p>Walk in, or use the boxes below.</p></div></section><section><div data-k-feature="booking" data-k-id="call" data-k-title="Book a call" data-k-days="mon-sun" data-k-hours="00:00-23:30" data-k-slot="30" data-k-tz="UTC"></div><div data-k-feature="form" data-k-id="contact" data-k-title="Send a note" data-k-fields="name,email,message" data-k-button="Send note"></div><div data-k-feature="newsletter" data-k-id="wl" data-k-kind="waitlist" data-k-title="Join the waitlist" data-k-button="Join"></div><div data-k-feature="data" data-k-id="menu" data-k-title="Today" data-k-fields="item,price" data-k-view="table" data-k-seed="Rye loaf;$8|Seeded loaf;$9"></div><div data-k-feature="checkout" data-k-id="shop" data-k-title="Order a loaf" data-k-currency="usd" data-k-products="Rye loaf;8.00;Baked daily|Seeded loaf;9.00"></div><div data-k-feature="blog" data-k-id="posts" data-k-title="Notes from the oven" data-k-seed="Slow rise;Twenty hours of fermentation gives the flavor."></div><div data-k-feature="search" data-k-id="find" data-k-title="Search the site"></div><div data-k-feature="embeds" data-k-id="map" data-k-kind="map" data-k-title="Visit us" data-k-address="12 Mill Lane, Brooklyn NY"></div></section>`);
      const members = shell("Members - Mill Lane Bakehouse", `<section><h1>Baker's notes</h1><p>Our secret starter feeding schedule.</p><div data-k-feature="members" data-k-id="area" data-k-gate="page" data-k-title="Members only"></div></section>`);
      const out = `<summary>Added booking, a contact form, a waitlist and a price table to the contact page.</summary>\n<file path="contact.html">\n${page}\n</file>\n<file path="members.html">\n${members}\n</file>\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: out } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 900, completion_tokens: 600, cost: 0 } })}\n\ndata: [DONE]\n\n`);
      return res.end();
    }
    if (j.stream && /failed Keplar's quality check/.test(lastUser)) {
      // A repair pass returns only the files it changed (here the stylesheet), as the real contract says; it must not rewrite the other pages.
      await new Promise((r) => setTimeout(r, Number(process.env.FAKE_LLM_DELAY || 120) * 6)); // a repair takes a moment, like the real thing
      const out = `<summary>Fixed the listed problems.</summary>\n<file path="styles.css">\n${css}\n</file>\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: out } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 300, completion_tokens: 200, cost: 0 } })}\n\ndata: [DONE]\n\n`);
      return res.end();
    }
    if (j.stream) {
      let out = "<summary>Built a three-page bakery site with a hand-set hero, a board of hours and a contact form.</summary>\n";
      for (const [p, c] of Object.entries(files)) out += `<file path="${p}">\n${c}\n</file>\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (let i = 0; i < out.length; i += 700) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: out.slice(i, i + 700) } }] })}\n\n`); await new Promise((r) => setTimeout(r, Number(process.env.FAKE_LLM_DELAY || 120))); }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 900, completion_tokens: 2400, cost: 0 } })}\n\ndata: [DONE]\n\n`);
      return res.end();
    }
    const content = /image_url/.test(text)
      ? JSON.stringify({ score: 7, summary: "Strong type and a clear hierarchy; the contact page is sparse.", issues: [] })
      : JSON.stringify({ idea: "A warm, no-nonsense site for Mill Lane Bakehouse, a neighborhood bakery, led by a bold headline about bread before sunrise, a plain board of opening hours and a way to reserve a loaf, with menu and find-us pages written in short, honest sentences.", adds: ["Lead with the opening hours board", "Use a reserve-a-loaf form"], missing: ["Your real hours", "Your address"] });
    reply(res, { choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 80, cost: 0 } });
  });
}).listen(Number(process.argv[2] || 4799), "127.0.0.1", () => console.log("fake llm on", process.argv[2] || 4799));
