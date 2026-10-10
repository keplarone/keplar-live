/**
 * Renders a curated showcase demo as one static HTML page (no scripts). Five composition archetypes, each filled with the item's
 * own sample content, palette and type, so the gallery shows range rather than one template recolored.
 */
import { SHOWCASE_DISCLOSURE, type ShowcaseItem } from "./data";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function base(it: ShowcaseItem, body: string, extraCss: string) {
  const p = it.palette;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(it.title)} · Keplar Create showcase demo</title>
<style>
:root{--bg:${p.bg};--surf:${p.surface};--ink:${p.ink};--mut:${p.muted};--acc:${p.accent};--line:${p.line};--fd:${it.font.display};--fb:${it.font.body}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--fb);-webkit-font-smoothing:antialiased}
a{color:inherit}h1,h2,h3{font-family:var(--fd);font-weight:500;margin:0}
.wrap{max-width:1120px;margin:0 auto;padding:0 clamp(18px,4vw,40px)}
.demo{font:12px/1.4 ui-sans-serif,system-ui,sans-serif;background:var(--ink);color:var(--bg);text-align:center;padding:7px 12px;letter-spacing:.01em}
.top{display:flex;align-items:baseline;gap:24px;padding:22px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-family:var(--fd);font-size:22px;letter-spacing:-.02em;text-decoration:none}
.nav{display:flex;gap:20px;margin-left:auto;font-size:14px;color:var(--mut);flex-wrap:wrap}
.nav a{text-decoration:none}.nav a[aria-current]{color:var(--ink);text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
.kick{font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.btn{display:inline-block;background:var(--ink);color:var(--bg);padding:12px 20px;text-decoration:none;font-weight:600;font-size:14px;border:0}
.foot{border-top:1px solid var(--line);padding:28px 0 40px;margin-top:72px;font-size:13px;color:var(--mut);display:flex;gap:24px;flex-wrap:wrap}
${extraCss}
</style></head><body>
<p class="demo">${esc(SHOWCASE_DISCLOSURE)}</p>
${body}
</body></html>`;
}

function editorial(it: ShowcaseItem) {
  const dark = it.slug === "field-notes-portfolio";
  const items = dark
    ? [["01", "The Salt Roads", "Two winters with the last hand-rakers on the Guérande marshes."], ["02", "Night Ferry", "Crossings between islands after the last bus has gone."], ["03", "Allotment", "A year inside one city garden, plot by plot."]]
    : [["01", "Ash glaze", "Speckled, matte, made with wood ash from the studio stove."], ["02", "Tide blue", "A deep cobalt that pools darker in every throwing line."], ["03", "Oat white", "Satin and warm, our everyday table glaze."]];
  const body = `<div class="wrap"><header class="top"><a class="brand" href="#">${esc(it.title)}</a><nav class="nav" aria-label="Main"><a aria-current="page" href="#">${dark ? "Work" : "Shop"}</a><a href="#">${dark ? "About" : "Kiln this week"}</a><a href="#">${dark ? "Commissions" : "Visit"}</a></nav></header>
<main>
<section class="hero"><p class="kick">${dark ? "Documentary · 2019 to now" : "Stoneware, thrown in small batches"}</p>
<h1 class="disp">${dark ? "Pictures that take<br><em>their time.</em>" : "Pots for the<br><em>everyday table.</em>"}</h1></section>
<section class="split"><figure class="fig"><div class="art" aria-hidden="true"><i></i><i></i><i></i></div><figcaption>${dark ? "Fig. 1 — Marsh at first light. Sample image area." : "Fig. 1 — Ash glaze test tiles, cone 10. Drawn sample."}</figcaption></figure>
<div class="col"><p class="lede">${dark ? "Long projects, made slowly, printed carefully. Each one starts with a place and the people who keep it going." : "Every piece is thrown, trimmed and glazed by the two of us. Batches are small, so collections come and go with the kiln."}</p><a class="btn" href="#">${dark ? "See the projects" : "Shop this firing"}</a></div></section>
<section><p class="kick">${dark ? "Projects" : "Glazes"}</p><ol class="index">${items.map(([n, t, d]) => `<li><span class="n">${n}</span><h2>${esc(t)}</h2><p>${esc(d)}</p></li>`).join("")}</ol></section>
${dark ? "" : `<section class="kiln"><p class="kick">Kiln this week</p><div class="rows"><p><b>Mon</b><span>Bisque · 42 pieces · cone 04</span></p><p><b>Wed</b><span>Glaze · ash and oat white · cone 10</span></p><p><b>Sat</b><span>Unload, photograph, list in the shop</span></p></div></section>`}
</main><footer class="foot"><span>${esc(it.title)}</span><span>Sample content</span><span>2026</span></footer></div>`;
  return base(it, body, `.hero{padding:clamp(56px,10vw,120px) 0 40px}.disp{font-size:clamp(44px,8vw,104px);line-height:.95;letter-spacing:-.04em;margin-top:18px}.disp em{color:var(--acc);font-style:italic}
.split{display:grid;grid-template-columns:7fr 4fr;gap:clamp(24px,5vw,72px);align-items:end;padding:24px 0 64px}.fig{margin:0}.art{aspect-ratio:4/3;background:var(--surf);border:1px solid var(--line);position:relative;overflow:hidden}
.art i{position:absolute;border-radius:50%;border:1px solid var(--acc)}.art i:nth-child(1){width:46%;aspect-ratio:1;left:12%;top:18%}.art i:nth-child(2){width:30%;aspect-ratio:1;left:48%;top:34%;background:color-mix(in srgb,var(--acc) 18%,transparent)}.art i:nth-child(3){width:16%;aspect-ratio:1;left:70%;top:14%;border-color:var(--mut)}
figcaption{font-size:12px;color:var(--mut);margin-top:10px}.lede{font-size:clamp(18px,1.6vw,21px);line-height:1.45;margin:0 0 24px}
.index{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid var(--line)}.index li{display:grid;grid-template-columns:64px 1fr 1.3fr;gap:20px;padding:22px 0;border-bottom:1px solid var(--line);align-items:baseline}
.index .n{font:12px ui-monospace,Menlo,monospace;color:var(--acc)}.index h2{font-size:clamp(22px,2.4vw,30px);letter-spacing:-.02em}.index p{margin:0;color:var(--mut)}
.kiln{margin-top:64px}.rows p{display:grid;grid-template-columns:80px 1fr;gap:16px;margin:0;padding:14px 0;border-bottom:1px solid var(--line)}.rows b{font-weight:600}
@media(max-width:760px){.split{grid-template-columns:1fr}.index li{grid-template-columns:40px 1fr}.index p{grid-column:2}}`);
}

function menu(it: ShowcaseItem) {
  const books = it.slug === "small-hours-books";
  const groups = books
    ? [["Readings", [["Thu 15 Oct", "Mara Voss — The Lighthouse Year", "RSVP"], ["Tue 20 Oct", "Poetry after hours, open mic", "RSVP"], ["Fri 30 Oct", "Translation night: Portuguese to English", "RSVP"]]], ["Staff picks", [["Ines", "A quiet novel about a night bakery", "€18"], ["Tom", "Essays on walking cities at 3am", "€22"]]]]
    : [["By the glass", [["Skin-contact Grüner", "Weinviertel, Austria", "9"], ["Pét-nat Rosé", "Loire, France", "10"], ["Carignan", "Roussillon, France", "11"]]], ["Bottles", [["Chenin, old vines", "Anjou, France", "48"], ["Nebbiolo, young", "Piemonte, Italy", "56"], ["Field blend", "Wachau, Austria", "52"]]]];
  const body = `<div class="wrap"><header class="top"><a class="brand" href="#">${esc(it.title)}</a><nav class="nav" aria-label="Main"><a aria-current="page" href="#">${books ? "Events" : "This week"}</a><a href="#">${books ? "Shelf" : "Tastings"}</a><a href="#">Visit</a></nav></header>
<main class="card"><p class="kick">${books ? "Open until midnight, Tuesday to Saturday" : "List for the week of 12 October · sample"}</p><h1 class="ttl">${books ? "Late readings,<br>good company." : "Wine, by the glass<br>and the bottle."}</h1>
${groups.map(([g, rows]) => `<section class="grp"><h2>${esc(g as string)}</h2><ul class="menu">${(rows as string[][]).map(([a, b, c]) => `<li><span class="nm">${esc(a)}</span><span class="dots" aria-hidden="true"></span><span class="pr">${esc(c)}</span><span class="ds">${esc(b)}</span></li>`).join("")}</ul></section>`).join("")}
<aside class="colophon"><p><b>${books ? "Reading club" : "Thursday tasting"}</b> ${books ? "First Sunday, 7pm. This month: a novel set in one night." : "Six wines, one producer, 7pm. Limited to 14 seats."}</p><a class="btn" href="#">${books ? "Join the club" : "Save a seat"}</a></aside>
</main><footer class="foot"><span>${esc(it.title)}</span><span>[Add: address]</span><span>[Add: opening hours]</span></footer></div>`;
  return base(it, body, `.card{max-width:760px;margin:clamp(40px,8vw,88px) auto 0;padding:clamp(24px,5vw,56px);background:var(--surf);border:1px solid var(--line)}
.ttl{font-size:clamp(36px,6vw,64px);line-height:1;letter-spacing:-.03em;margin:16px 0 40px}.grp{margin-top:36px}.grp h2{font-size:13px;font-family:var(--fb);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--acc);padding-bottom:10px;border-bottom:1px solid var(--line)}
.menu{list-style:none;margin:0;padding:0}.menu li{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;padding:14px 0 6px}
.nm{font-family:var(--fd);font-size:20px}.dots{border-bottom:1px dotted var(--mut);transform:translateY(-4px)}.pr{font-variant-numeric:tabular-nums;font-weight:600;color:var(--acc)}.ds{grid-column:1/-1;font-size:14px;color:var(--mut)}
.colophon{margin-top:44px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap}.colophon p{margin:0;max-width:44ch}`);
}

function ledger(it: ShowcaseItem) {
  const rows = [["R-218", "Ethiopia Guji", "12.0 kg", "1:52", "Done"], ["R-217", "Colombia Huila", "12.0 kg", "1:48", "Done"], ["R-216", "Kenya Nyeri", "9.5 kg", "1:41", "Cupping"], ["R-215", "Brazil Mogiana", "15.0 kg", "2:04", "Done"]];
  const stock = [["Ethiopia Guji", "84 kg", false], ["Kenya Nyeri", "11 kg", true], ["Brazil Mogiana", "132 kg", false]];
  const body = `<div class="app"><aside class="side"><a class="brand" href="#">${esc(it.title)}</a><nav aria-label="Main"><a aria-current="page" href="#">Overview</a><a href="#">Roasts</a><a href="#">Green stock</a><a href="#">Calendar</a></nav></aside>
<main class="main"><header class="hd"><div><p class="kick">Week 41 · sample data</p><h1>Overview</h1></div><a class="btn" href="#">Log a roast</a></header>
<section class="stats"><div><span class="kick">Roasted</span><b>148 kg</b><span class="mut">this week</span></div><div><span class="kick">Batches</span><b>12</b><span class="mut">avg 12.3 kg</span></div><div><span class="kick">Dev. time</span><b>1:49</b><span class="mut">median</span></div></section>
<section class="two"><div><h2>Recent roasts</h2><table><thead><tr><th>Batch</th><th>Origin</th><th>Charge</th><th>Dev.</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 4 && c === "Cupping" ? ' class="flag"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div><h2>Green stock</h2><ul class="stock">${stock.map(([n, k, low]) => `<li${low ? ' class="low"' : ""}><span>${esc(n as string)}</span><b>${esc(k as string)}</b>${low ? "<em>Low: about one week of roasting left</em>" : ""}</li>`).join("")}</ul></div></section>
</main></div>`;
  return base(it, body, `.app{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 30px)}.side{border-right:1px solid var(--line);padding:24px 20px;display:flex;flex-direction:column;gap:28px}
.side nav{display:grid;gap:2px}.side nav a{text-decoration:none;color:var(--mut);padding:8px 0;font-size:14px}.side nav a[aria-current]{color:var(--ink);font-weight:600}
.main{padding:28px clamp(18px,3vw,40px)}.hd{display:flex;justify-content:space-between;align-items:end;gap:16px;border-bottom:1px solid var(--line);padding-bottom:20px}.hd h1{font-size:44px;letter-spacing:-.04em;margin-top:8px;font-weight:700}
.stats{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--line)}.stats div{padding:22px 0;display:grid;gap:6px}.stats div+div{padding-left:24px;border-left:1px solid var(--line)}.stats b{font-size:40px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.mut{color:var(--mut);font-size:13px}
.two{display:grid;grid-template-columns:1.6fr 1fr;gap:40px;margin-top:32px}.two h2{font-family:var(--fb);font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}th{text-align:left;font-weight:500;color:var(--mut);padding:8px 0;border-bottom:1px solid var(--line)}td{padding:12px 0;border-bottom:1px solid var(--line)}td.flag{color:var(--acc);font-weight:600}
.stock{list-style:none;margin:0;padding:0}.stock li{display:grid;grid-template-columns:1fr auto;padding:12px 0;border-bottom:1px solid var(--line);gap:4px}.stock em{grid-column:1/-1;font-style:normal;font-size:13px;color:var(--acc)}.stock .low b{color:var(--acc)}
@media(max-width:820px){.app{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--line);flex-direction:row;align-items:center;flex-wrap:wrap}.side nav{display:flex;gap:14px}.two,.stats{grid-template-columns:1fr}.stats div+div{padding-left:0;border-left:0;border-top:1px solid var(--line)}}`);
}

function board(it: ShowcaseItem) {
  const courier = it.slug === "northline-couriers";
  const cols = courier
    ? [["Waiting", [["#4471", "Bakery → Clinic", "2.1 km · due 10:40"], ["#4472", "Print shop → Law office", "3.4 km · due 11:15"]]], ["On the road", [["#4468", "Florist → Hotel", "Ade · 1.2 km left"]]], ["Delivered", [["#4465", "Pharmacy → Flat 3B", "Proof photo · 09:58"]]]]
    : [["Night shift", [["Water bottle refilled", "Before handover · 2 taps"], ["10-minute walk", "On break"]]], ["Day off", [["Sleep 8 hours", "Streak 6, one miss forgiven"], ["Call home", "Any time"]]], ["Done today", [["Stretch before shift", "06:40"]]]];
  const body = `<div class="wrap"><header class="top"><a class="brand" href="#">${esc(it.title)}</a><nav class="nav" aria-label="Main"><a aria-current="page" href="#">${courier ? "Board" : "Today"}</a><a href="#">${courier ? "Riders" : "Month"}</a><a href="#">${courier ? "Ledger" : "Habits"}</a></nav></header>
<main><div class="hd"><div><p class="kick">${courier ? "Tuesday · 4 riders on · sample" : "Shift pattern: 3 nights, 2 off · sample"}</p><h1>${courier ? "Dispatch" : "Tonight"}</h1></div><a class="btn" href="#">${courier ? "New job" : "Check in"}</a></div>
<div class="cols">${cols.map(([h, cards]) => `<section class="col"><h2>${esc(h as string)} <span>${(cards as string[][]).length}</span></h2>${(cards as string[][]).map((c) => `<article class="cd">${c.length === 3 ? `<p class="id">${esc(c[0])}</p><h3>${esc(c[1])}</h3><p class="meta">${esc(c[2])}</p>` : `<h3>${esc(c[0])}</h3><p class="meta">${esc(c[1])}</p>`}</article>`).join("")}</section>`).join("")}</div></main></div>`;
  const brutal = courier
    ? `.cd{border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink);background:var(--surf)}.col h2{border-bottom:2px solid var(--ink);text-transform:uppercase;letter-spacing:.04em}.hd h1{text-transform:uppercase;font-weight:800}.btn{background:var(--acc);color:#0a0a0a;border:2px solid var(--ink)}`
    : `.cd{border:1px solid var(--line);border-radius:12px;background:var(--surf)}.col h2{border-bottom:1px solid var(--line)}.btn{border-radius:999px;background:var(--acc);color:#0a0a0a}`;
  return base(it, body, `.hd{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:36px 0 24px}.hd h1{font-size:clamp(40px,6vw,72px);letter-spacing:-.04em;margin-top:8px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.col h2{font-family:var(--fb);font-size:13px;font-weight:600;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between}.col h2 span{color:var(--mut)}
.cd{padding:16px;margin-bottom:12px}.cd h3{font-family:var(--fb);font-size:16px;font-weight:600}.id{font:12px ui-monospace,Menlo,monospace;color:var(--acc);margin:0 0 6px}.meta{margin:6px 0 0;font-size:13px;color:var(--mut)}
${brutal}@media(max-width:760px){.cols{grid-template-columns:1fr}}`);
}

function calendar(it: ShowcaseItem) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const slots: Record<string, [string, string][]> = { Mon: [["09:00", "Level 1 · 4 left"]], Wed: [["14:00", "Level 2 · full"]], Sat: [["09:00", "Level 1 · 2 left"], ["13:00", "Racing · 6 left"]], Sun: [["10:00", "Kids · 3 left"]] };
  const body = `<div class="wrap"><header class="top"><a class="brand" href="#">${esc(it.title)}</a><nav class="nav" aria-label="Main"><a aria-current="page" href="#">Sessions</a><a href="#">Courses</a><a href="#">My skills</a></nav></header>
<main><div class="hd"><div><p class="kick">Week of 12 October · sample</p><h1>Sessions</h1></div><p class="call"><b>Weather call</b> Saturday: <span>Go</span> · wind 12 kn SW</p></div>
<div class="cal">${days.map((d) => `<section class="day"><h2>${d}</h2>${(slots[d] ?? []).map(([t, l]) => `<a class="slot${l.includes("full") ? " full" : ""}" href="#"><b>${t}</b><span>${esc(l)}</span></a>`).join("") || '<p class="none">No sessions</p>'}</section>`).join("")}</div>
<section class="skills"><p class="kick">Level 1 skills</p><ul><li class="ok">Rigging</li><li class="ok">Tacking</li><li>Gybing</li><li>Capsize recovery</li></ul></section></main></div>`;
  return base(it, body, `.hd{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:40px 0 24px;flex-wrap:wrap}.hd h1{font-size:clamp(40px,6vw,72px);letter-spacing:-.03em;margin-top:8px}
.call{margin:0;padding:10px 14px;background:var(--surf);border:1px solid var(--line);font-size:14px}.call span{color:var(--acc);font-weight:700}
.cal{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid var(--line)}.day{border-right:1px solid var(--line);padding:12px 10px;min-height:180px}.day:last-child{border-right:0}.day h2{font-family:var(--fb);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:10px}
.slot{display:grid;gap:2px;padding:10px;margin-bottom:8px;background:var(--surf);border-left:3px solid var(--acc);text-decoration:none;font-size:13px}.slot.full{border-left-color:var(--mut);color:var(--mut)}.none{font-size:12px;color:var(--mut);margin:0}
.skills{margin-top:48px}.skills ul{list-style:none;padding:0;margin:12px 0 0;display:flex;gap:24px;flex-wrap:wrap}.skills li{padding-left:22px;position:relative}.skills li::before{content:"";position:absolute;left:0;top:.35em;width:12px;height:12px;border:1px solid var(--mut);border-radius:50%}.skills li.ok::before{background:var(--acc);border-color:var(--acc)}
@media(max-width:820px){.cal{grid-template-columns:1fr}.day{border-right:0;border-bottom:1px solid var(--line);min-height:0}}`);
}

export function renderShowcase(it: ShowcaseItem): string {
  switch (it.archetype) {
    case "editorial": return editorial(it);
    case "menu": return menu(it);
    case "ledger": return ledger(it);
    case "board": return board(it);
    case "calendar": return calendar(it);
  }
}
