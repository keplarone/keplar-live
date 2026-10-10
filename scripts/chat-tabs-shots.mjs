// Chat cards for every tab: drives /app through the composer (slash commands and plain requests) against stub APIs, then
// screenshots the inline cards in dark, light and on a phone. No model, database or provider is called: every /api route the
// cards use is answered here (page.route), and chats are kept in an in-memory store so a reload shows the same cards.
//   PORT=3493 scripts/e2e-dev.sh &   then:   node scripts/chat-tabs-shots.mjs http://localhost:3493 screenshots/chat-tabs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:3493";
const out = process.argv[3] || "screenshots/chat-tabs";
// ONLY=edits runs just the edit-from-chat shots (slides text, study plan, orders, agent settings, projects, history, create picker / domains).
const only = process.env.ONLY || "";
mkdirSync(out, { recursive: true });
const now = new Date().toISOString();
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

function fixtures() {
  const slides = [
    ["title", "How coffee is roasted", "", ["From green bean to the cup"]],
    ["content", "Green coffee", "Basics", ["Seeds of the coffee cherry, dried and hulled", "Dense, grassy and almost odorless", "Stored cool and dry for months"]],
    ["content", "What heat does", "The roast", ["Water leaves the bean first (drying)", "Maillard browning builds sweetness and body", "Sugars caramelize; acids fall as the roast goes on", "Gases build until the bean cracks"]],
    ["content", "First and second crack", "The roast", ["First crack: light roasts finish here", "Second crack: oils rise, flavors turn smoky"]],
    ["content", "Light, medium, dark", "Flavor", ["Light: bright, fruity, more acidity", "Medium: balanced and sweet", "Dark: bitter-sweet, heavy body"]],
    ["closing", "Rest, then brew", "", ["Let beans degas 3 to 10 days", "Grind just before brewing"]],
  ].map(([layout, title, section, bullets], i) => ({ id: `s${i}`, layout, title, section, bullets, notes: "", imagePrompt: "" }));
  const deck = { id: "deck_coffee", workspaceId: "w1", title: "How coffee is roasted", topic: "coffee roasting", style: "clean", theme: "dark", slides, credits: 18, createdAt: now, updatedAt: now };
  const topics = [
    { id: "t1", name: "Light reactions", outline: ["Chlorophyll in the thylakoids captures light and splits water, releasing oxygen."] },
    { id: "t2", name: "ATP and NADPH", outline: ["The light energy is stored in two carrier molecules for the next stage."] },
    { id: "t3", name: "Calvin cycle", outline: ["In the stroma, CO2 is fixed by RuBisCO and built into sugar."] },
  ];
  const cards = [
    { id: "c1", topicId: "t1", front: "Where do the light reactions happen?", back: "In the thylakoid membranes of the chloroplast.", page: 1 },
    { id: "c2", topicId: "t1", front: "What gas is released when water is split?", back: "Oxygen.", page: 1 },
    { id: "c3", topicId: "t3", front: "Which enzyme fixes CO2 in the Calvin cycle?", back: "RuBisCO.", page: 2 },
  ];
  const questions = [
    { id: "q1", topicId: "t3", type: "mc", q: "Which enzyme fixes carbon dioxide in the Calvin cycle?", options: ["ATP synthase", "RuBisCO", "Amylase", "Catalase"], page: 2 },
    { id: "q2", topicId: "t1", type: "mc", q: "What is released when water is split in the light reactions?", options: ["Carbon dioxide", "Glucose", "Oxygen", "Nitrogen"], page: 1 },
  ];
  const set = { id: "set_photo", workspaceId: "w1", title: "Photosynthesis", source: { kind: "text", pages: 1, chars: 1800, truncated: false }, summary: "How plants turn light, water and CO2 into sugar.", topics, cards, questions, questionCount: questions.length, examDate: null, coverage: 1, credits: 9, createdAt: now, updatedAt: now };
  const progress = { overall: 0.42, mastery: [{ topicId: "t1", name: "Light reactions", mastery: 0.7, level: "good" }, { topicId: "t2", name: "ATP and NADPH", mastery: 0.35, level: "weak" }, { topicId: "t3", name: "Calvin cycle", mastery: null, level: "new" }], dueCards: 2, streak: { current: 3, best: 5 }, diagnosticDone: false };
  const approvals = [
    { id: "ap1", agentName: "Lead follow-up", status: "pending", risk: "medium", createdAt: ago(0.1), action: { type: "email.send", connector: "gmail", to: "maya@northside-bikes.com", subject: "Your tune-up quote", body: "Hi Maya, thanks for asking about a tune-up. A full service is $85 and takes a day. Want me to book you in for Thursday?" } },
    { id: "ap2", agentName: "Weekly digest", status: "pending", risk: "low", createdAt: ago(0.4), action: { type: "slack.post", connector: "slack", channel: "#shop", text: "This week: 14 bookings, 3 new leads, revenue up 12%." } },
    { id: "ap3", agentName: "Social posts", status: "sent", createdAt: ago(2), action: { type: "social.schedule", connector: "social", network: "instagram", text: "Spring tune-ups are open.", at: ago(1) }, result: "Scheduled" },
  ];
  const agents = [
    { id: "ag1", name: "Lead follow-up", template: "lead-followup", status: "active", trigger: { type: "event", label: "New lead" }, next: null, unitsThisMonth: 42, autoSend: false },
    { id: "ag2", name: "Weekly digest", template: "weekly-report", status: "active", trigger: { type: "schedule", cron: "0 9 * * 1", tz: "America/New_York", label: "Mondays at 09:00 (America/New_York)" }, next: ago(-3), unitsThisMonth: 12, autoSend: false, caps: { monthlyUnits: 1500, runsPerDay: 24, outboundPerDay: 20, spendUsdPerMonth: 3 } },
    { id: "ag4", name: "Watch the parts supplier", template: "monitor", status: "active", trigger: { type: "schedule", cron: "0 */6 * * *", tz: "America/New_York", label: "Every 6 hours" }, next: ago(-0.1), unitsThisMonth: 4, autoSend: false, caps: { monthlyUnits: 1500, runsPerDay: 24, outboundPerDay: 20, spendUsdPerMonth: 3 }, monitor: { url: "https://parts.example.com/tubes", keyword: "in stock" } },
    { id: "ag3", name: "Review replies", template: "reviews", status: "paused", trigger: { type: "event", label: "New review" }, next: null, unitsThisMonth: 0, autoSend: false },
  ];
  const apps = [
    { id: "app_bike", name: "BikeFix", appName: "BikeFix", kind: "booking", previewUrl: "/apps/app_bike/", thumb: null, publishedVersion: 3, headVersion: 4, publishedUrl: "https://bikefix.keplar.app", updatedAt: ago(0.2) },
    { id: "app_bake", name: "Mill Lane Bakehouse", appName: "Mill Lane", kind: "site", previewUrl: "/apps/app_bake/", thumb: null, publishedVersion: null, headVersion: 2, publishedUrl: null, updatedAt: ago(3) },
  ];
  const crm = {
    contacts: [
      { id: "ct1", name: "Maya Brooks", email: "maya@northside-bikes.com", source: "form", createdAt: ago(0.1), lastActivityAt: ago(0.1), tags: [] },
      { id: "ct2", name: "Leo Park", email: "leo@example.com", source: "checkout", createdAt: ago(1), lastActivityAt: ago(1), tags: [] },
      { id: "ct3", name: "Ana Ruiz", email: "ana@example.com", source: "manual", createdAt: ago(6), lastActivityAt: ago(4), tags: [] },
    ],
    deals: [
      { id: "d1", contactId: "ct1", title: "Tune-up", value: 8500, currency: "usd", stage: "proposal", updatedAt: ago(0.1) },
      { id: "d2", contactId: "ct3", title: "Fleet service (6 bikes)", value: 54000, currency: "usd", stage: "qualified", updatedAt: ago(2) },
    ],
  };
  const dash = { revenue: { last30: 412000, total: 1893000, currency: "usd" }, orders: { last30: 38, pending: 2 }, leads: { last30: 11, total: 64 }, traffic: { last14: 1830, days: Array.from({ length: 14 }, (_, i) => ({ day: ago(13 - i).slice(0, 10), views: 90 + ((i * 37) % 70) })) }, conversion: { rate: 0.031, windowDays: 30 }, agents: { active: 2, total: 3, halted: false }, approvals: { pending: 2 } };
  const orders = [
    ["Full service", 8500, "paid", "maya@northside-bikes.com", 0.1], ["Flat repair", 2000, "paid", "leo@example.com", 0.6], ["Tune-up", 6000, "pending", "ana@example.com", 0.9],
    ["Wheel true", 3500, "paid", "kim@example.com", 1.5, 1500], ["Fleet service (6 bikes)", 54000, "paid", "ops@courier.example", 3], ["Brake bleed", 4000, "refunded", "jo@example.com", 5, 4000],
  ].map(([productName, amount, status, customerEmail, d, refundedAmount], i) => ({ id: `ord${i}`, productName, amount, currency: "usd", status, customerEmail, createdAt: ago(d), applicationFeeAmount: 0, ...(refundedAmount ? { refundedAmount } : {}) }));
  const projects = [{ id: "p_taxes", name: "Taxes", createdAt: Date.now() - 9e8 }, { id: "p_fin", name: "Finance", createdAt: Date.now() - 8e8 }, { id: "p_trip", name: "Lisbon trip", createdAt: Date.now() - 7e8 }];
  const chat = (id, title, projectId, d) => [id, { id, title, projectId, createdAt: Date.now() - d * 864e5, updatedAt: Date.now() - d * 864e5, messages: [] }];
  const chats = new Map([chat("c_sour", "Sourdough starter tips", null, 2), chat("c_ded", "2025 deductions", "p_taxes", 3), chat("c_est", "Quarterly estimated payments", "p_taxes", 4), chat("c_bud", "Monthly budget", "p_fin", 5), chat("c_tram", "Tram 28 and miradouros", "p_trip", 6)]);
  const domains = [{ id: "dom1", hostname: "www.bikefix.com", siteId: "app_bike", status: "pending", apex: false, ownershipVerified: false, records: [{ type: "CNAME", name: "www", host: "www.bikefix.com", value: "cname.vercel-dns.com" }], problems: [], nameservers: ["ns1.registrar.example"], message: "Waiting for the CNAME record to show up in DNS.", lastCheckedAt: ago(0.01), createdAt: ago(0.02), url: "https://www.bikefix.com" }];
  const spec = { name: "BikeFix", kind: "booking", pages: [{ path: "/", title: "Home" }, { path: "/book", title: "Book" }], collections: [{ name: "bookings" }], ai: [], auth: false, files: ["index.html", "app.js", "styles.css"], notBuilt: [] };
  return { deck, set, progress, approvals, agents, apps, crm, dash, orders, projects, domains, spec, notes: { p_taxes: [{ id: "n1", text: "Use the 2025 1099s from the shared folder." }] }, design: { style: "minimal", mode: "dark", fonts: "geist-like" }, chats };
}

const answer = (md) => ({ id: "a" + Math.random().toString(36).slice(2), smalltalk: true, markdown: md, consensus: { level: "high", score: null, agree: 1, disagree: 0, missing: 0, responded: 1, consulted: 1, summary: "" }, models: [], sources: [], disagreements: [], verification: { mode: "none", summary: "", checks: [], notes: [] }, reasoning: "", capabilities: [], compute: { units: 1, level: "low" }, durationMs: 900 });
const PHOTO = "Photosynthesis is how plants turn light into food.\n\n1. **Light reactions.** In the thylakoid membranes, chlorophyll captures light and splits water, which releases oxygen.\n2. **Energy carriers.** That energy is stored as ATP and NADPH.\n3. **Calvin cycle.** In the stroma, the enzyme RuBisCO fixes carbon dioxide, and ATP and NADPH turn it into sugar (G3P), which the plant builds into glucose and starch.\n\nOverall: 6 CO2 + 6 H2O + light → C6H12O6 + 6 O2.";

async function mock(page, db, plan = "plus") {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
    if (p === "/api/compute") return json(route, { used: 140, total: 4000, plan, resetsAt: null, paused: false, signedIn: true, account: { id: "u_demo", email: "sam@example.com", name: "Sam" }, windows: null });
    if (p === "/api/memory") return json(route, { enabled: false });
    if (p === "/api/chats" && m === "GET") return json(route, { chats: [...db.chats.values()].map((c) => ({ id: c.id, title: c.title, projectId: c.projectId, createdAt: c.createdAt, updatedAt: c.updatedAt })) });
    const chat = p.match(/^\/api\/chats\/([^/]+)$/);
    if (chat) {
      const id = decodeURIComponent(chat[1]);
      if (m === "PUT") { db.chats.set(id, { id, ...body() }); return json(route, { ok: true }); }
      if (m === "GET") return db.chats.has(id) ? json(route, { chat: db.chats.get(id) }) : json(route, { error: "Not found" }, 404);
      if (m === "PATCH" && db.chats.has(id)) db.chats.set(id, { ...db.chats.get(id), ...body() });
      if (m === "DELETE") db.chats.delete(id);
      return json(route, { ok: true });
    }
    if (p === "/api/keplar") {
      await new Promise((r) => setTimeout(r, 400));
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer: answer(PHOTO) }) + "\n" });
    }
    // Slides
    if (p === "/api/slides/decks" && m === "POST") { await new Promise((r) => setTimeout(r, 600)); return json(route, { deck: db.deck, credits: 18 }); }
    if (p === "/api/slides/decks/deck_coffee/regenerate") {
      const { index, instruction } = body();
      const s = db.deck.slides[index];
      db.deck = { ...db.deck, slides: db.deck.slides.map((x, i) => (i === index ? { ...s, bullets: /shorter/.test(instruction) ? ["Drying, then browning, then caramelizing", "Gases build until the bean cracks"] : s.bullets } : x)) };
      await new Promise((r) => setTimeout(r, 500));
      return json(route, { deck: db.deck, credits: 2 });
    }
    if (p === "/api/slides/decks/deck_coffee") { if (m === "PUT") db.deck = { ...db.deck, ...body() }; return json(route, { deck: db.deck }); }
    // Study
    if (p === "/api/study/sets" && m === "POST") { await new Promise((r) => setTimeout(r, 500)); return json(route, { id: db.set.id, credits: 9 }); }
    if (p === `/api/study/sets/${db.set.id}`) {
      if (m === "PATCH") { const { examDate } = body(); db.set = { ...db.set, examDate: examDate || null }; return json(route, { set: db.set }); }
      const plan = db.set.examDate ? [
        ["Today", [["learn", "Learn: ATP and NADPH (weak)"], ["cards", "Flashcards: 2 due"]]], ["Tomorrow", [["learn", "Learn: Calvin cycle (new)"], ["quiz", "Quiz: Calvin cycle"]]],
        ["In 2 days", [["cards", "Flashcards: review"], ["quiz", "Quiz: light reactions"]]], ["In 3 days", [["review", "Review day: every topic"]]], ["Day before the exam", [["mock", "Mock exam, then rest"]]],
      ].map(([label, tasks], i) => ({ date: ago(-i).slice(0, 10), label, tasks: tasks.map(([kind, text]) => ({ kind, text })) })) : [];
      return json(route, { set: db.set, progress: db.progress, plan });
    }
    if (p === `/api/study/sets/${db.set.id}/progress`) { db.progress = { ...db.progress, diagnosticDone: true }; return json(route, { ok: true }); }
    if (p === `/api/study/sets/${db.set.id}/cards`) return m === "GET" ? json(route, { cards: db.set.cards.map((c) => ({ ...c, state: null })) }) : json(route, { ok: true });
    if (p === `/api/study/sets/${db.set.id}/quiz`) return json(route, { questions: db.set.questions });
    if (p === `/api/study/sets/${db.set.id}/answer`) { const { questionId, choice } = body(); const right = questionId === "q1" ? 1 : 2; const q = db.set.questions.find((x) => x.id === questionId); return json(route, { correct: choice === right, reference: q.options[right], explanation: questionId === "q1" ? "RuBisCO attaches CO2 to RuBP, the first step of the Calvin cycle." : "Splitting water releases O2.", feedback: "", credits: 0 }); }
    // Business
    if (p === "/api/business/approvals") return json(route, { approvals: db.approvals });
    const ap = p.match(/^\/api\/business\/approvals\/([^/]+)$/);
    if (ap) {
      const { decision, edits } = body(); const st = decision === "approve" ? "sent" : "rejected";
      db.approvals = db.approvals.map((a) => (a.id === ap[1] ? { ...a, status: st, result: st === "sent" ? "Sent" : undefined, action: edits?.body ? { ...a.action, body: edits.body } : edits?.text ? { ...a.action, text: edits.text } : a.action } : a));
      const a = db.approvals.find((x) => x.id === ap[1]);
      return json(route, { approval: { status: st, result: a.result, action: a.action } });
    }
    if (p === "/api/business/agents") return json(route, { agents: db.agents, runEstimateUnits: 6, settings: { agentsHalted: false }, schedule: { fastestAllowed: "every hour" } });
    const ag = p.match(/^\/api\/business\/agents\/([^/]+)$/);
    if (ag && m === "PATCH") {
      const b = body();
      const label = (cron, tz) => { const [mi, h, , , dw] = cron.split(" "); const t = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`; return `${dw === "1-5" ? "Weekdays" : dw === "*" ? "Every day" : ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][Number(dw)]} at ${t} (${tz})`; };
      db.agents = db.agents.map((a) => (a.id !== ag[1] ? a : { ...a, ...(b.status ? { status: b.status } : {}), ...(b.caps ? { caps: { ...a.caps, ...b.caps } } : {}), ...(b.monitor ? { monitor: { ...a.monitor, ...b.monitor } } : {}), ...(b.schedule ? { trigger: { ...a.trigger, cron: b.schedule.cron, tz: b.schedule.tz, label: label(b.schedule.cron, b.schedule.tz) } } : {}) }));
      return json(route, { agent: db.agents.find((a) => a.id === ag[1]) });
    }
    if (ag && m === "POST") return json(route, { run: { status: "done" } });
    if (p === "/api/business/crm" && m === "GET") return json(route, db.crm);
    if (p === "/api/business/dashboard") return json(route, db.dash);
    if (p === "/api/business/orders") return json(route, { orders: db.orders });
    if (p === "/api/apps" && m === "GET") return json(route, { apps: db.apps, config: { plan, estimateUnits: 40, maxUnits: 400, limits: { backend: true, ai: true }, styles: [["minimal", "Minimal"], ["brutalist", "Brutalist"], ["editorial", "Editorial"], ["playful", "Playful"]].map(([id, name]) => ({ id, name, line: "" })) } });
    if (p === "/api/apps/app_bike" && m === "GET") return json(route, { app: { id: "app_bike", name: "BikeFix", spec: db.spec, report: null, previewUrl: "/apps/app_bike/", liveUrl: "https://bikefix.keplar.app", publishedVersion: 3, headVersion: 4, design: db.design } });
    if (p === "/api/apps/app_bike/theme") { db.design = { ...db.design, ...(body().design ?? {}) }; return json(route, { ok: true, design: db.design }); }
    if (p === "/api/sites") return json(route, { sites: [] });
    if (p === "/api/projects" && m === "GET") return json(route, { projects: db.projects });
    const pj = p.match(/^\/api\/projects\/([^/]+)(\/memory)?$/);
    if (pj) {
      const id = pj[1];
      if (pj[2] && m === "POST") { const n = { id: "n" + Math.random().toString(36).slice(2, 7), text: body().text }; (db.notes[id] ||= []).push(n); return json(route, { note: n }); }
      if (m === "GET") return json(route, { project: db.projects.find((x) => x.id === id), notes: db.notes[id] ?? [], files: [] });
      if (m === "PATCH") { db.projects = db.projects.map((x) => (x.id === id ? { ...x, ...body() } : x)); return json(route, { project: db.projects.find((x) => x.id === id) }); }
      if (m === "DELETE") { db.projects = db.projects.filter((x) => x.id !== id); return json(route, { ok: true }); }
    }
    // Domains (Plus: three allowed; the free plan gets the plan message from the listing)
    if (p === "/api/domains" && m === "GET") return json(route, { domains: plan === "free" ? [] : db.domains, limit: plan === "free" ? 0 : 3, used: plan === "free" ? 0 : db.domains.length, plan, configured: true, published: true });
    if (p === "/api/domains" && m === "POST") { const { domain } = body(); const d = { ...db.domains[0], id: "dom" + (db.domains.length + 1), hostname: domain, apex: !domain.startsWith("www."), records: [{ type: "A", name: "@", host: domain, value: "76.76.21.21" }], message: "Add the A record, then check again." }; db.domains = [...db.domains, d]; return json(route, { domain: d }, 201); }
    const dm = p.match(/^\/api\/domains\/([^/]+)$/);
    if (dm) { if (m === "DELETE") { db.domains = db.domains.filter((x) => x.id !== dm[1]); return json(route, { ok: true }); } return json(route, { domain: db.domains.find((x) => x.id === dm[1]) }); }
    if (["/api/faq", "/api/mcp/chat", "/api/team", "/api/share", "/api/billing/extensions"].includes(p)) return json(route, {});
    return route.continue();
  });
  // The app preview inside the Create card: a stand-in page drawn in the app's current look.
  await page.route((url) => url.pathname.startsWith("/apps/app_bike/"), (route) => {
    const file = new URL(route.request().url()).pathname.slice("/apps/app_bike/".length);
    if (file === "app.js") return route.fulfill({ status: 200, contentType: "text/plain", body: `// BikeFix: booking form\nconst form = document.querySelector("#book");\nform?.addEventListener("submit", async (e) => {\n  e.preventDefault();\n  const data = Object.fromEntries(new FormData(form));\n  await kapp.db.bookings.insert({ ...data, status: "new" });\n  form.replaceWith(Object.assign(document.createElement("p"), { textContent: "Booked. We'll text you a time." }));\n});\n` });
    if (file === "styles.css") return route.fulfill({ status: 200, contentType: "text/plain", body: ":root { --accent: #e4572e; }\nbody { margin: 0; font-family: var(--font-body); }\n.hero h1 { font-size: clamp(2rem, 6vw, 4rem); }\n" });
    const b = db.design.style === "brutalist";
    route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><body style="margin:0;font:16px/1.5 ${b ? "Arial Black,Arial" : "Georgia"},sans-serif;background:${b ? "#f2efe6" : "#111"};color:${b ? "#111" : "#eee"}"><header style="padding:28px 6vw;${b ? "border-bottom:6px solid #111" : ""}"><b>BikeFix</b></header><main style="padding:6vh 6vw"><h1 style="font-size:${b ? "64px" : "44px"};margin:0 0 12px;text-transform:${b ? "uppercase" : "none"}">Bike repairs, booked in a minute</h1><p>Tune-ups, flats and full services in Brooklyn.</p><a style="display:inline-block;padding:12px 20px;background:${b ? "#111" : "#eee"};color:${b ? "#f2efe6" : "#111"};text-decoration:none">Book a repair</a></main></body></html>` });
  });
}

const errors = [];
async function session(browser, { theme, phone, plan, name }) {
  // Reduced motion: the send burst (a full-screen WebGL canvas) is off, so headless screenshots show the page, not a blank frame.
  const ctx = await browser.newContext({ reducedMotion: "reduce", ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }) });
  await ctx.addInitScript((t) => { try { localStorage.setItem("keplar.acct.v2.u_demo", JSON.stringify({ threads: [], projects: [{ id: "p_taxes", name: "Taxes", createdAt: Date.now() - 9e8 }, { id: "p_fin", name: "Finance", createdAt: Date.now() - 8e8 }, { id: "p_trip", name: "Lisbon trip", createdAt: Date.now() - 7e8 }], activeThreadId: null, settings: {} })); localStorage.setItem("keplar-theme", t); localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} }, theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${String(e).slice(0, 240)}`));
  const db = fixtures();
  await mock(page, db, plan);
  await page.goto(base + "/app", { waitUntil: "load" });
  await page.waitForSelector('textarea[id$="-input"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { ctx, page, db };
}
async function say(page, text) {
  const ta = page.locator('textarea[id$="-input"]').last();
  await ta.click();
  await ta.fill(text);
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape"); // close the slash menu if it opened
  await ta.press("Enter");
}
async function shot(page, sel, file) {
  const el = page.locator(sel).last();
  await el.waitFor({ timeout: 20000 });
  // The card's top with the message above it in view, so the shot shows what was typed and what came back.
  await el.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    let s = e.parentElement;
    while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
    (s ?? document.scrollingElement).scrollBy(0, -150);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${file}` });
  console.log("  shot", file);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const theme of only ? [] : ["dark", "light"]) {
  console.log(theme);
  const { ctx, page } = await session(browser, { theme, name: theme });
  // Slides: a plain request, then a follow-up on the same deck
  await say(page, "make a slideshow about how coffee is roasted");
  await page.waitForSelector('[data-studio="slides"][data-phase="ready"]', { timeout: 30000 });
  await shot(page, '[data-studio="slides"][data-phase="ready"]', `slides-${theme}.png`);
  await say(page, "make slide 3 shorter");
  await page.waitForFunction(() => document.querySelectorAll('[data-studio="slides"][data-phase="ready"]').length >= 2, null, { timeout: 30000 });
  await shot(page, '[data-studio="slides"][data-phase="ready"]', `slides-followup-${theme}.png`);
  // Study: "quiz me on" answers, then the card opens on the quiz
  await say(page, "quiz me on photosynthesis");
  await page.waitForSelector('[data-studio="study"][data-phase="ready"]', { timeout: 30000 });
  await page.waitForSelector('[data-quiz="question"]', { timeout: 15000 }).catch(() => {});
  const opt = page.locator('[data-quiz="question"] button').nth(1);
  if (await opt.count()) { await opt.click(); await page.waitForTimeout(500); }
  await shot(page, '[data-studio="study"][data-phase="ready"]', `study-quiz-${theme}.png`);
  const cardsTab = page.locator('[data-studio="study"] [role="radio"]', { hasText: "Flashcards" }).last();
  await cardsTab.click();
  await page.waitForTimeout(600);
  await page.locator('[data-studio="study"] button[aria-label^="Question"]').last().click().catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, '[data-studio="study"][data-phase="ready"]', `study-flashcards-${theme}.png`);
  // Business: slash command and plain requests
  await say(page, "/approvals");
  await shot(page, '[data-workspace="approvals"]', `approvals-${theme}.png`);
  await say(page, "show my agents");
  await shot(page, '[data-workspace="agents"]', `agents-${theme}.png`);
  await say(page, "how's my business doing?");
  await shot(page, '[data-workspace]', `dashboard-${theme}.png`);
  await say(page, "/crm");
  await shot(page, '[data-workspace="crm"]', `crm-${theme}.png`);
  await say(page, "show my apps");
  await shot(page, '[data-workspace="apps"]', `apps-${theme}.png`);
  // Create: change an existing app's look by name, then publish it as a follow-up (one confirm click)
  await say(page, "make my BikeFix app brutalist");
  await page.waitForFunction(() => [...document.querySelectorAll("[data-create]")].some((e) => e.getAttribute("data-create") === "ready"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "[data-create]", `create-look-${theme}.png`);
  await say(page, "publish it");
  await page.waitForTimeout(2000);
  await shot(page, "[data-create]", `create-publish-${theme}.png`);
  if (theme === "dark") {
    // Cards are part of the saved chat: reload and the same cards come back from the account
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('textarea[id$="-input"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Recents/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const recent = page.locator("a, button", { hasText: /coffee|slideshow/i }).first();
    if (await recent.count()) { await recent.click().catch(() => {}); await page.waitForTimeout(3500); }
    const n = await page.locator("[data-studio], [data-workspace]").count();
    console.log("  after reload, cards on screen:", n);
    if (n) { await page.locator("[data-studio]").first().scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/after-reload-${theme}.png` }); }
    else errors.push("after reload: no cards came back");
  }
  await ctx.close();
}
// Phone, dark: slides card and approvals
if (!only) {
  console.log("phone");
  const { ctx, page } = await session(browser, { theme: "dark", phone: true, name: "phone" });
  await say(page, "make a slideshow about how coffee is roasted");
  await page.waitForSelector('[data-studio="slides"][data-phase="ready"]', { timeout: 30000 });
  await shot(page, '[data-studio="slides"][data-phase="ready"]', "phone-slides-dark.png");
  await say(page, "show my pending approvals");
  await shot(page, '[data-workspace="approvals"]', "phone-approvals-dark.png");
  await ctx.close();
}
// Free plan: the slides card says plainly that Slides is on Plus and Pro
if (!only) {
  console.log("free");
  const { ctx, page } = await session(browser, { theme: "dark", plan: "free", name: "free" });
  await say(page, "/slides how coffee is roasted");
  await shot(page, '[data-studio="slides"]', "slides-free-plan-dark.png");
  await ctx.close();
}
// Edits from the chat (no tab needed): slide text and order, study plan and placement quiz, orders, approval edits, agent settings,
// project rename / merge / delete and chat delete (each destructive one waits for a confirm click), the Create picker, code and domains.
async function edits(theme, phone = false) {
  const tag = phone ? "phone-" : "";
  const sfx = phone ? "dark" : theme;
  const { ctx, page } = await session(browser, { theme, phone, name: `edits-${tag}${theme}` });
  const card = (sel) => page.locator(sel).last();
  await say(page, "make a slideshow about how coffee is roasted");
  await page.waitForSelector('[data-studio="slides"][data-phase="ready"]', { timeout: 30000 });
  await card('[data-studio="slides"][data-phase="ready"]').locator('button[aria-label^="Slide 3:"]').click();
  await card("[data-slide-edit]").locator('[data-mode="text"]').click();
  await card("[data-slide-edit]").locator("input").first().fill("What heat does to a bean");
  await card("[data-slide-edit]").getByRole("button", { name: "Save slide" }).click();
  await page.waitForTimeout(600);
  await shot(page, "[data-slide-edit]", `${tag}slides-edit-${sfx}.png`);
  if (phone) { await ctx.close(); return; }
  await say(page, "delete slide 5");
  await page.waitForFunction(() => document.querySelectorAll('[data-studio="slides"][data-phase="ready"]').length >= 2, null, { timeout: 30000 });
  await shot(page, '[data-studio="slides"][data-phase="ready"]', `slides-delete-confirm-${theme}.png`);
  await card('[data-studio="slides"][data-phase="ready"]').locator("[data-confirm]").click();
  await page.waitForTimeout(600);
  await say(page, "move slide 4 to 2");
  await page.waitForFunction(() => document.querySelectorAll('[data-studio="slides"][data-phase="ready"]').length >= 3, null, { timeout: 30000 });
  await shot(page, '[data-studio="slides"][data-phase="ready"]', `slides-move-${theme}.png`);
  // Study: exam date from words, the plan, then the placement quiz
  await say(page, "quiz me on photosynthesis");
  await page.waitForSelector('[data-studio="study"][data-phase="ready"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await say(page, "my exam is on Nov 20");
  await page.waitForSelector('[data-plan="days"]', { timeout: 20000 });
  await shot(page, '[data-studio="study"][data-phase="ready"]', `study-plan-${theme}.png`);
  await say(page, "take the placement quiz");
  await page.waitForFunction(() => { const c = [...document.querySelectorAll('[data-studio="study"]')].pop(); return !!c?.querySelector('[data-quiz="question"]'); }, null, { timeout: 20000 });
  await shot(page, '[data-studio="study"][data-phase="ready"]', `study-placement-${theme}.png`);
  // Orders
  await say(page, "show my orders");
  await shot(page, '[data-workspace="orders"]', `orders-${theme}.png`);
  // Approvals: edit the email before approving
  await say(page, "/approvals");
  await card('[data-workspace="approvals"]').locator("[data-edit-draft]").first().click();
  await card('[data-workspace="approvals"]').locator("[data-draft-edit]").fill("Hi Maya, thanks for asking about a tune-up. A full service is $85 and we can do it same day if you drop the bike off by 10am. Want Thursday?");
  await shot(page, '[data-workspace="approvals"]', `approvals-edit-${theme}.png`);
  // Agents: a new schedule in words, then the settings panel
  await say(page, "run my weekly digest every weekday at 9am");
  await page.waitForFunction(() => { const c = [...document.querySelectorAll('[data-workspace="agents"]')].pop(); return !!c?.querySelector('[role="status"]'); }, null, { timeout: 20000 });
  await card('[data-workspace="agents"]').locator("[data-agent-settings]").nth(1).click();
  await page.waitForTimeout(400);
  await shot(page, '[data-workspace="agents"]', `agents-settings-${theme}.png`);
  // Projects: merge (confirm) and delete asked in words (confirm)
  await say(page, "/projects");
  const pc = card('[data-workspace="projects"]');
  await pc.waitFor({ timeout: 20000 });
  await pc.locator('[data-project="p_taxes"]').getByRole("button", { name: "Merge" }).click();
  await page.waitForTimeout(300);
  await shot(page, '[data-workspace="projects"]', `projects-merge-confirm-${theme}.png`);
  await say(page, "delete the Lisbon trip project");
  await page.waitForFunction(() => document.querySelectorAll('[data-workspace="projects"]').length >= 2, null, { timeout: 20000 });
  await shot(page, '[data-workspace="projects"]', `projects-delete-confirm-${theme}.png`);
  // History: delete a chat by topic (confirm)
  await say(page, "delete my chat about sourdough");
  await shot(page, '[data-workspace="history"]', `history-delete-confirm-${theme}.png`);
  // Create: look panel with fonts and colors, the code view, then domains
  await say(page, "make my BikeFix app dark");
  await page.waitForFunction(() => [...document.querySelectorAll("[data-create]")].some((e) => e.getAttribute("data-create") === "ready"), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, "[data-create]", `create-picker-${theme}.png`);
  await card("[data-create]").getByRole("tab", { name: "Code" }).click();
  await card("[data-create]").getByRole("button", { name: "app.js" }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "[data-create]", `create-code-${theme}.png`);
  await say(page, "connect bikefix.com to my BikeFix app");
  await page.waitForFunction(() => document.querySelectorAll("[data-create]").length >= 2 && !![...document.querySelectorAll("[data-domains]")].length, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "[data-domains]", `create-domains-${theme}.png`);
  await ctx.close();
}
for (const theme of ["dark", "light"]) { console.log("edits", theme); await edits(theme); }
{ console.log("edits phone"); await edits("dark", true); }
{
  // Free plan: the domains panel says it is a Plus feature, and the phone layout of the agent settings
  const { ctx, page } = await session(browser, { theme: "dark", plan: "free", name: "edits-free" });
  await say(page, "connect bikefix.com to my BikeFix app");
  await page.waitForSelector("[data-domains]", { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "[data-domains]", "create-domains-free-plan-dark.png");
  await ctx.close();
  const ph = await session(browser, { theme: "dark", phone: true, name: "edits-phone-agents" });
  await say(ph.page, "show my agents");
  await ph.page.locator('[data-workspace="agents"]').last().locator("[data-agent-settings]").nth(1).click();
  await ph.page.waitForTimeout(400);
  await shot(ph.page, "[data-agent-edit]", "phone-agents-settings-dark.png");
  await say(ph.page, "show my orders");
  await shot(ph.page, '[data-workspace="orders"]', "phone-orders-dark.png");
  await ph.ctx.close();
}
await browser.close();
console.log(errors.length ? "PAGE ERRORS\n" + errors.join("\n") : "no page errors");
