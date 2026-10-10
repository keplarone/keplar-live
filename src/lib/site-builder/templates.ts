/**
 * Starter templates: complete multi-page sites built without a model (free, instant). Pick one, then change it by chat.
 * Plain HTML + CSS (no scripts); contact forms are wired to the lead inbox when the site is previewed or published.
 */
export type TemplateId = "business" | "portfolio" | "landing" | "restaurant" | "blank";

export type TemplateInfo = { id: TemplateId; name: string; description: string; pages: string[]; starterPrompt: string; accent: string };

export const TEMPLATES: TemplateInfo[] = [
  { id: "business", name: "Local business", description: "Home, services, about and a contact form. For shops, studios and trades.", pages: ["Home", "Services", "About", "Contact"], starterPrompt: "Make this for a neighborhood bike repair shop called Spoke & Chain: friendly, trustworthy, with repair prices and opening hours.", accent: "#0f766e" },
  { id: "portfolio", name: "Portfolio", description: "A clean showcase of your work, an about page and a contact form.", pages: ["Work", "About", "Contact"], starterPrompt: "Make this a portfolio for a freelance illustrator named Maya Ortiz with six sample projects and a calm, editorial look.", accent: "#9333ea" },
  { id: "landing", name: "Product landing", description: "Hero, features, pricing, FAQ and a waitlist form.", pages: ["Home", "Pricing", "Contact"], starterPrompt: "Make this a landing page for a habit-tracking app called Streak, with three plans and a waitlist signup.", accent: "#2563eb" },
  { id: "restaurant", name: "Cafe or restaurant", description: "Menu, story, hours and a reservation or inquiry form.", pages: ["Home", "Menu", "Visit"], starterPrompt: "Make this for a small neighborhood cafe called Fig & Oat with a seasonal menu, opening hours and a catering inquiry form.", accent: "#b45309" },
  { id: "blank", name: "Blank", description: "One empty page. Describe what you want and Keplar builds it.", pages: ["Home"], starterPrompt: "", accent: "#18181b" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function css(accent: string) {
  return `:root{--accent:${accent};--bg:#ffffff;--ink:#16181d;--muted:#5b616e;--line:#e5e7eb;--soft:#f5f6f8;--radius:14px}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--ink:#f1f3f6;--muted:#a0a7b4;--line:#262a33;--soft:#171a21}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,-apple-system,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}img,svg{max-width:100%;display:block}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
header.site{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.brand{font-weight:700;font-size:1.15rem;letter-spacing:-.01em;color:var(--ink);text-decoration:none}
nav ul{display:flex;gap:6px;list-style:none;margin:0;padding:0;flex-wrap:wrap}
nav a{display:block;padding:8px 12px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:.95rem}
nav a:hover,nav a[aria-current=page]{color:var(--ink);background:var(--soft)}
.hero{padding:88px 0 64px}.hero h1{font-size:clamp(2.2rem,5.5vw,3.8rem);line-height:1.05;letter-spacing:-.03em;margin:0 0 18px;max-width:16ch}
.hero p.lead{font-size:1.2rem;color:var(--muted);max-width:56ch;margin:0 0 28px}
.btn{display:inline-block;padding:12px 22px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border:0;font:inherit;font-weight:600;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:2px}
section{padding:56px 0}section>h1{font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.1;letter-spacing:-.025em;margin:0 0 14px}section h2{font-size:clamp(1.5rem,3vw,2.1rem);letter-spacing:-.02em;margin:0 0 12px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{background:var(--soft);border:1px solid var(--line);border-radius:var(--radius);padding:24px}.card h3{margin:0 0 6px;font-size:1.1rem}.card p{margin:0;color:var(--muted)}
.price{font-size:2rem;font-weight:700;letter-spacing:-.02em}.tag{display:inline-block;font-size:.8rem;font-weight:600;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.art{aspect-ratio:4/3;border-radius:var(--radius);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 80%,#fff),color-mix(in srgb,var(--accent) 25%,var(--bg)))}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid var(--line)}
details{border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:10px 0;background:var(--soft)}summary{cursor:pointer;font-weight:600}
form.lead{display:grid;gap:14px;max-width:520px}label{display:grid;gap:6px;font-weight:600;font-size:.95rem}
input,textarea,select{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
footer.site{border-top:1px solid var(--line);padding:32px 0;color:var(--muted);font-size:.95rem}
@media (pointer:coarse){.brand{display:inline-flex;align-items:center;min-height:44px}nav a{display:flex;align-items:center;min-height:44px}.btn{min-height:44px}}
@media (max-width:640px){.hero{padding:56px 0 40px}section{padding:40px 0}.wrap{padding:0 18px}header.site .wrap{gap:4px 16px}.brand{display:inline-flex;align-items:center;min-height:44px}nav ul{gap:2px}nav a{display:flex;align-items:center;min-height:44px;padding:8px 14px}.btn{min-height:44px}summary{padding:10px 0}}
`;
}

type Ctx = { name: string; pages: [string, string][] };

function layout(ctx: Ctx, file: string, title: string, desc: string, mainIn: string) {
  // Every page needs one <h1>: on inner pages the first section heading is the page title.
  const main = /<h1[\s>]/.test(mainIn) ? mainIn : mainIn.replace(/<h2>([\s\S]*?)<\/h2>/, "<h1>$1</h1>");
  const nav = ctx.pages.map(([f, l]) => `<li><a href="${f}"${f === file ? ' aria-current="page"' : ""}>${esc(l)}</a></li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="stylesheet" href="styles.css"></head>
<body><header class="site"><div class="wrap"><a class="brand" href="index.html">${esc(ctx.name)}</a><nav aria-label="Main"><ul>${nav}</ul></nav></div></header>
<main>${main}</main>
<footer class="site"><div class="wrap">&copy; ${esc(ctx.name)}. All rights reserved.</div></footer></body></html>`;
}

const form = (fields: string, button = "Send message") => `<form class="lead">${fields}<button class="btn" type="submit">${button}</button></form>`;
const contactFields = `<label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Message<textarea name="message" rows="5" required></textarea></label>`;

export function buildTemplate(id: TemplateId, name = "Your Brand"): Record<string, string> {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
  const files: Record<string, string> = { "styles.css": css(t.accent) };
  const nm = name.trim().slice(0, 60) || "Your Brand";
  const add = (ctx: Ctx, f: string, title: string, desc: string, main: string) => (files[f] = layout(ctx, f, title, desc, main));

  if (id === "business") {
    const ctx: Ctx = { name: nm, pages: [["index.html", "Home"], ["services.html", "Services"], ["about.html", "About"], ["contact.html", "Contact"]] };
    add(ctx, "index.html", `${nm} | Friendly, reliable service`, `${nm}: honest work, fair prices, and people who answer the phone.`, `<div class="wrap"><div class="hero"><span class="tag">Open this week</span><h1>Honest work, done properly.</h1><p class="lead">${esc(nm)} helps your neighbors with fast turnaround, clear prices and no surprises.</p><a class="btn" href="contact.html">Get a free quote</a> <a class="btn ghost" href="services.html">See services</a></div>
<section><h2>Why people choose us</h2><div class="grid"><div class="card"><h3>Clear pricing</h3><p>You see the price before we start. No hidden fees.</p></div><div class="card"><h3>Fast turnaround</h3><p>Most jobs are finished within two working days.</p></div><div class="card"><h3>Guaranteed</h3><p>Not happy? We fix it, free of charge.</p></div></div></section></div>`);
    add(ctx, "services.html", `Services | ${nm}`, `What ${nm} offers and what it costs.`, `<div class="wrap"><section><h2>Services and prices</h2><table><thead><tr><th>Service</th><th>From</th></tr></thead><tbody><tr><td>Standard service</td><td>$49</td></tr><tr><td>Full inspection</td><td>$89</td></tr><tr><td>Express (same day)</td><td>$129</td></tr></tbody></table><p><a class="btn" href="contact.html">Book now</a></p></section></div>`);
    add(ctx, "about.html", `About | ${nm}`, `The story and the people behind ${nm}.`, `<div class="wrap"><section><h2>About us</h2><p>We started ${esc(nm)} because good service shouldn't be hard to find. Tell customers who you are, how long you've been doing this and what you care about.</p><div class="grid"><div class="card"><h3>Our promise</h3><p>Do it right, explain it clearly, charge fairly.</p></div><div class="card"><h3>Hours</h3><p>Mon&ndash;Fri 9&ndash;6<br>Sat 10&ndash;4</p></div></div></section></div>`);
    add(ctx, "contact.html", `Contact | ${nm}`, `Get in touch with ${nm} for a quote or a question.`, `<div class="wrap"><section><h2>Get in touch</h2><p>Tell us what you need. We reply within one working day.</p>${form(contactFields)}</section></div>`);
  } else if (id === "portfolio") {
    const ctx: Ctx = { name: nm, pages: [["index.html", "Work"], ["about.html", "About"], ["contact.html", "Contact"]] };
    const tiles = [1, 2, 3, 4, 5, 6].map((n) => `<a class="card" href="contact.html" style="text-decoration:none;color:inherit"><div class="art" role="img" aria-label="Project ${n} placeholder"></div><h3 style="margin-top:14px">Project ${n}</h3><p>A short line about the brief and result.</p></a>`).join("");
    add(ctx, "index.html", `${nm} | Portfolio`, `Selected work by ${nm}.`, `<div class="wrap"><div class="hero"><h1>${esc(nm)}</h1><p class="lead">Designer and maker. Selected work from the last few years.</p></div><section style="padding-top:0"><div class="grid">${tiles}</div></section></div>`);
    add(ctx, "about.html", `About | ${nm}`, `About ${nm}.`, `<div class="wrap"><section><h2>About</h2><p>Write two or three sentences about your background, what you love working on and how you like to collaborate.</p><p><a class="btn" href="contact.html">Work with me</a></p></section></div>`);
    add(ctx, "contact.html", `Contact | ${nm}`, `Contact ${nm} about a project.`, `<div class="wrap"><section><h2>Let's talk</h2>${form(contactFields)}</section></div>`);
  } else if (id === "landing") {
    const ctx: Ctx = { name: nm, pages: [["index.html", "Home"], ["pricing.html", "Pricing"], ["contact.html", "Contact"]] };
    add(ctx, "index.html", `${nm} | Do more with less effort`, `${nm} makes the hard part easy. Join the waitlist.`, `<div class="wrap"><div class="hero"><span class="tag">Now in early access</span><h1>The simple way to get it done.</h1><p class="lead">${esc(nm)} turns a messy routine into one clear next step. Free to start.</p><a class="btn" href="#join">Join the waitlist</a> <a class="btn ghost" href="pricing.html">See pricing</a></div>
<section><h2>Built around what matters</h2><div class="grid"><div class="card"><h3>Fast</h3><p>Set up in a minute. No training needed.</p></div><div class="card"><h3>Private</h3><p>Your data stays yours.</p></div><div class="card"><h3>Flexible</h3><p>Works the way you already work.</p></div></div></section>
<section><h2>Questions</h2><details><summary>Is it free?</summary><p>There is a free plan. Paid plans add more.</p></details><details><summary>Can I cancel any time?</summary><p>Yes, in one click.</p></details></section>
<section id="join"><h2>Get early access</h2>${form('<label>Email<input name="email" type="email" required autocomplete="email"></label>', "Join the waitlist")}</section></div>`);
    add(ctx, "pricing.html", `Pricing | ${nm}`, `Simple pricing for ${nm}.`, `<div class="wrap"><section><h2>Pricing</h2><div class="grid"><div class="card"><h3>Free</h3><div class="price">$0</div><p>For trying it out.</p></div><div class="card"><h3>Plus <span class="tag">Popular</span></h3><div class="price">$9<small>/mo</small></div><p>For everyday use.</p></div><div class="card"><h3>Team</h3><div class="price">$29<small>/mo</small></div><p>For groups of up to ten.</p></div></div></section></div>`);
    add(ctx, "contact.html", `Contact | ${nm}`, `Contact ${nm}.`, `<div class="wrap"><section><h2>Contact us</h2>${form(contactFields)}</section></div>`);
  } else if (id === "restaurant") {
    const ctx: Ctx = { name: nm, pages: [["index.html", "Home"], ["menu.html", "Menu"], ["visit.html", "Visit"]] };
    add(ctx, "index.html", `${nm} | Good food, warm welcome`, `${nm}: seasonal food and good coffee. See the menu and opening hours.`, `<div class="wrap"><div class="hero"><span class="tag">Open daily</span><h1>Good food, made slowly.</h1><p class="lead">Seasonal plates, fresh bakes and coffee worth a detour. Come hungry.</p><a class="btn" href="menu.html">See the menu</a> <a class="btn ghost" href="visit.html">Plan your visit</a></div><section><div class="grid"><div class="art" role="img" aria-label="Photo placeholder"></div><div class="card"><h3>This week</h3><p>Ask about our rotating special. We bake every morning and sell out most days.</p></div></div></section></div>`);
    const item = (n: string, d: string, p: string) => `<tr><td><strong>${n}</strong><br><span style="color:var(--muted)">${d}</span></td><td>${p}</td></tr>`;
    add(ctx, "menu.html", `Menu | ${nm}`, `The ${nm} menu.`, `<div class="wrap"><section><h2>Breakfast and lunch</h2><table><tbody>${item("Seasonal toast", "Ricotta, roasted fruit, honey", "$9")}${item("Soup of the day", "With bread and butter", "$8")}${item("Market salad", "Greens, grains, house dressing", "$12")}</tbody></table></section><section><h2>Drinks</h2><table><tbody>${item("Flat white", "", "$4.5")}${item("Filter coffee", "", "$3.5")}${item("Fresh juice", "", "$6")}</tbody></table></section></div>`);
    add(ctx, "visit.html", `Visit | ${nm}`, `Opening hours, address and inquiries for ${nm}.`, `<div class="wrap"><section><h2>Opening hours</h2><p>Mon&ndash;Fri 8&ndash;4<br>Sat&ndash;Sun 9&ndash;5</p><p>Add your street address here.</p></section><section><h2>Catering and bookings</h2>${form(contactFields, "Send inquiry")}</section></div>`);
  } else {
    const ctx: Ctx = { name: nm, pages: [["index.html", "Home"]] };
    add(ctx, "index.html", nm, `${nm}.`, `<div class="wrap"><div class="hero"><h1>${esc(nm)}</h1><p class="lead">Describe your site in the chat and Keplar will build it here.</p></div></div>`);
  }
  return files;
}
