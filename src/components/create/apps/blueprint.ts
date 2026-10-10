/**
 * The blueprint on the Create studio's canvas: a line drawing of the app before it exists. While the owner types, it is
 * inferred from the words (what kind of app, which screens, which data); once the planner answers, it is redrawn from the
 * real spec; while files are written and tested, each screen fills in; when the build is done the canvas develops into the
 * live preview. Pure and deterministic (no model call), so it can run on every pause in typing.
 */
export type Layout = "feed" | "profile" | "grid" | "detail" | "form" | "chat" | "board" | "calendar" | "hero" | "table" | "canvas" | "list" | "auth" | "checkout" | "stats" | "settings";
export type BlueprintKind = "social" | "ai" | "store" | "game" | "dashboard" | "booking" | "marketplace" | "learning" | "community" | "site" | "tool";
export type BlueprintScreen = { title: string; route: string; layout: Layout; state?: "idle" | "writing" | "written" | "tested" | "failed" };
export type Blueprint = { kind: BlueprintKind; label: string; screens: BlueprintScreen[]; data: string[]; traits: string[]; confident: boolean };

const KINDS: { kind: BlueprintKind; label: string; words: RegExp; screens: [string, string, Layout][]; data: string[] }[] = [
  { kind: "social", label: "Social app", words: /\b(social|feed|followers?|follows?|likes?|profiles?|posts?|friends?|share (photos|moments)|network|creators?)\b/g, screens: [["Feed", "/", "feed"], ["Profile", "/u/:id", "profile"], ["Post", "/p/:id", "detail"], ["Explore", "/explore", "grid"], ["Sign in", "/join", "auth"]], data: ["posts", "comments", "likes", "follows"] },
  { kind: "ai", label: "AI tool", words: /\b(ai|gpt|llm|chat ?bot|assistant|generat\w*|summari[sz]\w*|rewrite|transcri\w*|copilot|prompt|agent)\b/g, screens: [["Workspace", "/", "chat"], ["History", "/history", "list"], ["Result", "/r/:id", "detail"], ["Library", "/library", "grid"], ["Settings", "/settings", "settings"]], data: ["runs", "documents"] },
  { kind: "store", label: "Online store", words: /\b(store|shop|e-?commerce|products?|cart|checkout|merch|sell(ing)?|orders?|catalog)\b/g, screens: [["Shop", "/", "grid"], ["Product", "/p/:id", "detail"], ["Cart", "/cart", "checkout"], ["Account", "/account", "auth"], ["Orders", "/orders", "table"]], data: ["products", "orders", "reviews"] },
  { kind: "game", label: "Game", words: /\b(game|puzzle|levels?|score|arcade|play(er|ers)?|quiz game|trivia|leaderboard|high ?score|platformer|wordle)\b/g, screens: [["Play", "/play", "canvas"], ["Title", "/", "hero"], ["Levels", "/levels", "grid"], ["Scores", "/scores", "list"], ["Settings", "/settings", "settings"]], data: ["scores", "progress"] },
  { kind: "dashboard", label: "Dashboard", words: /\b(dashboard|analytics|metrics|kpis?|reports?|crm|admin panel|track(er|ing)?|inventory|finance|budget|expenses?)\b/g, screens: [["Overview", "/", "stats"], ["Records", "/records", "table"], ["Detail", "/r/:id", "detail"], ["Board", "/board", "board"], ["Settings", "/settings", "settings"]], data: ["records", "events"] },
  { kind: "booking", label: "Booking app", words: /\b(book(ing|ings)?|appointments?|reserv\w*|schedul\w*|slots?|salon|clinic|calendar|classes|rentals?)\b/g, screens: [["Home", "/", "hero"], ["Services", "/services", "list"], ["Book", "/book", "calendar"], ["My bookings", "/me", "list"], ["Admin", "/admin", "table"]], data: ["services", "bookings", "staff"] },
  { kind: "marketplace", label: "Marketplace", words: /\b(marketplace|listings?|sellers?|buyers?|vendors?|bids?|auctions?|classifieds|freelanc\w*|hire)\b/g, screens: [["Browse", "/", "grid"], ["Listing", "/l/:id", "detail"], ["Sell", "/sell", "form"], ["Messages", "/inbox", "chat"], ["Profile", "/u/:id", "profile"]], data: ["listings", "offers", "messages"] },
  { kind: "learning", label: "Learning app", words: /\b(study|learn(ing)?|flash ?cards?|quiz(zes)?|courses?|lessons?|students?|tutor|exam|homework|language)\b/g, screens: [["Study", "/study", "canvas"], ["Today", "/", "stats"], ["Decks", "/decks", "grid"], ["Ask a tutor", "/tutor", "chat"], ["Progress", "/progress", "list"]], data: ["decks", "cards", "attempts"] },
  { kind: "community", label: "Community", words: /\b(forum|community|threads?|discussions?|members?|club|groups?|events?|meetups?|q&a)\b/g, screens: [["Threads", "/", "list"], ["Thread", "/t/:id", "detail"], ["Events", "/events", "calendar"], ["Members", "/members", "grid"], ["Join", "/join", "auth"]], data: ["threads", "replies", "events"] },
  { kind: "site", label: "Website", words: /\b(website|site|landing|portfolio|marketing|homepage|blog|restaurant|bar|cafe|agency|studio|menu)\b/g, screens: [["Home", "/", "hero"], ["Work", "/work", "grid"], ["About", "/about", "detail"], ["Contact", "/contact", "form"], ["Journal", "/journal", "list"]], data: ["inquiries"] },
  { kind: "tool", label: "Web app", words: /\b(app|tool|planner|tracker|notes?|todo|habit|journal|list|organi[sz]er|manager|kanban|board)\b/g, screens: [["Board", "/board", "board"], ["Today", "/", "list"], ["Item", "/i/:id", "detail"], ["Stats", "/stats", "stats"], ["Settings", "/settings", "settings"]], data: ["items"] },
];

/** Nouns worth drawing as data collections when the owner names them. */
const NOUNS = ["posts", "comments", "likes", "follows", "photos", "products", "orders", "reviews", "bookings", "services", "stylists", "staff", "slots", "listings", "offers", "messages", "notes", "quizzes", "cards", "decks", "levels", "scores", "events", "members", "threads", "replies", "recipes", "tasks", "projects", "invoices", "clients", "habits", "entries", "playlists", "tracks", "courses", "lessons", "workouts", "expenses", "contacts", "tickets", "challenges", "votes", "articles", "menus", "reservations"];

const TRAITS: [string, RegExp][] = [
  ["Accounts", /\b(sign ?up|log ?in|accounts?|profiles?|members?|users?)\b/],
  ["AI inside", /\b(ai|gpt|llm|generat\w*|summari[sz]\w*|explain\w*|grades?|recommend\w*|assistant)\b/],
  ["Live updates", /\b(real-?time|live|chat|messag\w*|notifications?)\b/],
  ["Uploads", /\b(upload\w*|photos?|images?|files?|scans?|avatars?)\b/],
  ["Payments", /\b(pay(ment)?s?|checkout|stripe|subscriptions?|tickets?|pricing)\b/],
  ["Admin", /\b(admin|moderat\w*|dashboard|manage)\b/],
];

const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Infers the blueprint from what the owner typed so far. Empty or very short text gives a neutral "Your app" drawing. */
export function inferBlueprint(prompt: string): Blueprint {
  const text = ` ${prompt.toLowerCase()} `;
  let best = KINDS[KINDS.length - 1];
  let bestScore = 0;
  for (const k of KINDS) {
    const hits = text.match(k.words)?.length ?? 0;
    // "app"/"site" style words are weak evidence; specific kinds win ties.
    const score = hits * (k.kind === "tool" || k.kind === "site" ? 0.8 : 1);
    if (score > bestScore) { best = k; bestScore = score; }
  }
  const named = NOUNS.filter((n) => new RegExp(`\\b${n.replace(/s$/, "")}(e?s)?\\b`).test(text));
  const data = bestScore ? [...new Set([...named, ...best.data])].slice(0, 5) : [];
  const traits = TRAITS.filter(([, re]) => re.test(text)).map(([t]) => t);
  const screens = best.screens.map(([title, route, layout]) => ({ title, route, layout }));
  return { kind: best.kind, label: bestScore ? best.label : "Your app", screens, data, traits, confident: bestScore >= 1 && prompt.trim().length >= 12 };
}

/** The layout a planned screen most likely has, from its title and route. */
export function layoutFor(title: string, route: string, kind?: BlueprintKind): Layout {
  const t = `${title} ${route}`.toLowerCase();
  const rules: [RegExp, Layout][] = [
    [/sign ?in|log ?in|sign ?up|join|register|auth|account\b/, "auth"],
    [/setting|preference/, "settings"],
    [/admin|manage|orders|records|table|inventory|clients|invoices/, "table"],
    [/cart|checkout|pay/, "checkout"],
    [/book|calendar|schedule|slot|event|agenda/, "calendar"],
    [/chat|inbox|message|assistant|ask|tutor/, "chat"],
    [/profile|\/u\/|\/me\b|my /, "profile"],
    [/feed|timeline|wall/, "feed"],
    [/stat|overview|progress|insight|analytic|report|today|dashboard/, "stats"],
    [/play|game|study|canvas|editor|draw|level\/|quiz\b/, "canvas"],
    [/board|kanban|pipeline/, "board"],
    [/new|create|edit|compose|write|upload|sell|contact|submit/, "form"],
    [/explore|browse|gallery|shop|grid|discover|levels|decks|products|work|members/, "grid"],
    [/:id|detail|post\b|item|product\b|listing|thread\b/, "detail"],
    [/history|list|services|scores|saved|notes/, "list"],
  ];
  for (const [re, layout] of rules) if (re.test(t)) return layout;
  if (route === "/" || /home|landing|index|about/.test(t)) return kind === "social" ? "feed" : kind === "store" ? "grid" : kind === "dashboard" ? "stats" : "hero";
  return "detail";
}

type SpecLike = { name: string; kind: string; pages: { route: string; title: string }[]; collections: { name: string }[]; auth: boolean; ai: unknown[]; files?: string[] };
type LiveLike = { files: { path: string }[]; checks: { ok: boolean; route?: string; label?: string }[] };

/**
 * The blueprint from the planner's spec, with each screen's progress: "writing" until a file whose name matches the screen is
 * written, "written" after, "tested"/"failed" once the browser test reports on its route.
 */
export function blueprintFromSpec(spec: SpecLike, live?: LiveLike, opts?: { building?: boolean }): Blueprint {
  const guess = inferBlueprint(`${spec.kind} ${spec.name}`);
  const files = (live?.files ?? []).map((f) => f.path.toLowerCase());
  const screens: BlueprintScreen[] = spec.pages.slice(0, 8).map((p) => {
    const slug = p.route.replace(/^\/+|\/+$/g, "").split("/")[0].replace(/^:.*/, "").toLowerCase() || "home";
    const tslug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const written = files.some((f) => f.startsWith("pages/") && (f.includes(slug) || (tslug && f.includes(tslug)))) || (files.includes("app.js") && slug === "home" && files.length > 2);
    const check = live?.checks.find((c) => c.route === p.route);
    const state: BlueprintScreen["state"] = check ? (check.ok ? "tested" : "failed") : written ? "written" : opts?.building ? "writing" : "idle";
    return { title: p.title, route: p.route, layout: layoutFor(p.title, p.route, guess.kind), state };
  });
  const traits = [spec.auth ? "Accounts" : "", spec.ai.length ? "AI inside" : ""].filter(Boolean);
  return { kind: guess.kind, label: spec.name, screens, data: spec.collections.map((c) => c.name).slice(0, 6), traits, confident: true };
}

/** 0..1 progress of a build for the canvas, from the stage and what has been written/tested. */
export function buildProgress(stage: string, filesWritten: number, filesPlanned: number): number {
  const base: Record<string, [number, number]> = { "": [0.02, 0.04], plan: [0.04, 0.16], generate: [0.16, 0.62], verify: [0.62, 0.8], visual: [0.8, 0.88], fix: [0.7, 0.9], save: [0.92, 0.98], done: [1, 1] };
  const [a, b] = base[stage] ?? [0.04, 0.1];
  if (stage === "generate" && filesPlanned > 0) return a + (b - a) * Math.min(1, filesWritten / filesPlanned);
  return a;
}

export { titleCase };
