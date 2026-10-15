/**
 * Planner: one prompt (plus the design choice) becomes an AppSpec. The model classifies what is being asked for, decides
 * pages, data, access rules, accounts, AI actions, images and the file plan, and writes the requested-feature checklist that the
 * verifier later compares against what was built.
 */
import { todayLine } from "./generate";
import { llm, parseJsonObject, type Msg } from "./llm";
import { normalizeSpec } from "./spec";
import { CREATE_EXPLAIN_STYLE } from "@/lib/style/clarity";
import type { AppBuildLimits, AppModel } from "./models";
import type { AppSpec } from "./types";

const KIND_GUIDE = `HOW TO PLAN COMMON KINDS (adapt, never copy blindly)
- social: users are the built-in accounts (auth.enabled, profileFields like bio/website/location + avatar). Collections: the content (posts with image + caption + tags), likes (fields post:ref, unique ["post","_owner"], read public, create auth, delete owner), follows (field following: ref users, unique ["following","_owner"]), comments (post:ref, body; realtime). Pages: feed ("/", following + discover tabs), post detail "/p/:id", profile "/u/:id" (posts grid, follower/following counts, follow button), compose "/new" (auth, image upload), maybe explore/search, settings "/settings" (edit profile + avatar). Seed 6-10 posts with believable captions and _ownerName values.
- booking: services (admin-managed, public read, seeded with real-sounding names, durations, prices), staff (optional), bookings (create public or auth, read owner, admin sees all; fields service:ref, date, time, name, email/phone, note, status select). Pages: home/landing with services and the booking flow, "/book" (step flow with available time slots computed client-side from opening hours minus existing bookings), "/me" (my bookings), "/admin" (admin: day/week schedule, status changes, service editor). Admin access via role admin.
- schedules: only when the idea needs the app to do something by itself on a timetable (a daily digest, a weekly summary, a word of the day): an AI action with fixed input run every "day" or "week" on the published app, its text saved into a text/longtext field of a collection the app shows. Otherwise [].
- ai: AI actions with carefully written system prompts (role, rules, output format; json output when the UI needs structure, e.g. a quiz {questions:[{q, choices[], answer, why}]}). Store the user's material (notes, chats, results) in owner-read collections. Use stream for long prose, run+json for structured UI.
- game: no accounts unless asked; game logic in its own modules (state, input, render loop on canvas or DOM), levels/difficulty, scoring, pause, restart, keyboard + touch controls, win/lose screens, best scores in keplar.local. If the plan has a backend and leaderboards make sense: a scores collection (public read, create public, fields name, score; order "-score").
- dashboard/saas/tool: real data model, CRUD with forms and validation, filters/search/sort, summary metrics computed from records (never invented), charts drawn with SVG.
- marketplace: listings (images, price, category, status), favorites (toggle), messages or offers (owner read), seller profiles.
- site (marketing, portfolio, editorial, event, restaurant...): multi-page HTML (index.html, about.html, ...), one shared styles.css, optional site.js for small interactions (menu, reveal, gallery). Links between pages are relative ("about.html"). Use collections only for a working form (e.g. inquiries: create public, read admin) when the plan has a backend.`;

function filePlanRules(L: AppBuildLimits): string {
  return `FILE PLAN RULES
- Up to ${L.maxFiles} files, ${L.maxPages} pages/screens. Choose the smallest structure that builds everything well.
- Single-page apps (anything interactive): "uses" includes "ui" (Preact+htm) unless it is a pure canvas game; "three" only for real 3D. Files: app.js (entry: routes, frame, nav), lib/*.js (shared components/helpers/state, list their "exports" exactly, e.g. ["Avatar","PostCard","timeAgo"]), pages/*.js (one per screen, default export), styles.css. Do NOT list index.html for single-page apps (Keplar writes it).
- Multi-page sites (kind "site"): index.html + one .html per page + styles.css (+ optional site.js). No "ui". Three.js is supported for websites too: include "three" in uses when the user requests a 3D scene, product viewer or other real 3D interaction; put its implementation in site.js using the injected window.THREE. Plan a readable HTML fallback and reduced-motion behavior. Never require CDN scripts or external imports.
- Games: app.js + game/*.js modules (+ lib/*.js) + styles.css.
- Seed rows must satisfy every required field. Image fields in seeds take "keplar-image:<slot>" values that name one of your "images" slots (declare slots for example content too, e.g. post1..post4 for a photo feed); never invent URLs.
- Each file's "purpose" says precisely what it contains (components, behaviors, states), so files written in parallel fit together. Shared modules list every export with a short signature in the purpose, e.g. "PostCard({post, likes, liked, onLike}) -> card with image, caption, owner, like button".`;
}

const SCHEMA = `OUTPUT: one JSON object, no prose, with exactly these keys:
{
 "name": "product name (invent a distinctive, fitting name if none is given)",
 "tagline": "one line",
 "kind": "site|app|game|social|ai|dashboard|marketplace|saas|tool|booking",
 "summary": "what it is and how it works, 2-4 sentences",
 "audience": "who uses it",
 "pages": [{"route":"/","title":"...","purpose":"what is on this screen and what you can do","auth":false,"admin":false}],
 "collections": [{"name":"posts","label":"Posts","fields":[{"name":"caption","type":"longtext","required":true,"max":2000}],"read":"public","create":"auth","update":"owner","delete":"owner","unique":[],"realtime":false,"seed":[{"caption":"...","_ownerName":"Ines R."}]}],
 "auth": {"enabled": true, "methods": ["password","magic"], "roles": ["member","admin"], "profileFields": ["bio"]},
 "ai": [{"name":"makeQuiz","label":"Make a quiz","purpose":"...","system":"full system prompt","input":[{"name":"notes","max":12000}],"output":"json","maxTokens":1500,"tier":"fast","auth":true}],
 "schedules": [{"name":"dailyDigest","label":"Daily digest","every":"day","ai":"writeDigest","input":{"topic":"..."},"save":{"collection":"digests","field":"body"}}],
 "features": [{"id":"likes","title":"Like posts","detail":"heart toggle with live count on cards and detail","must":true}],
 "uses": ["ui"],
 "images": [{"slot":"hero","prompt":"detailed image-generation prompt in the art direction","aspect":"16:9","alt":"..."}],
 "copy": {"voice":"how the product talks","keyMessages":["..."]},
 "files": [{"path":"app.js","purpose":"...","exports":[]}],
 "notBuilt": ["anything requested that this plan will not build, plainly"],
 "decisions": [{"choice":"the layout, structure or stack decision","why":"why it fits this person's goal, in plain words","tradeoff":"what it gives up"}],
 "assumptions": ["what you assumed where the request was open (audience, scale, content, hours, tone)"]
}
Field types: text, longtext, number, boolean, date, datetime, email, url, image (stores an uploaded file URL), file, ref (+ "ref": collection name or "users"), select (+ "options"), tags (string array), json.
Access values: public, auth, owner, admin, none. The owner of a record is its creator (_owner). Use "unique" for one-per-user toggles.
Features: the complete checklist of what the person asked for plus what the product obviously needs to be real (6-16 items), each testable.
Decisions: the 2-3 choices that matter most to the owner (not code details). ${CREATE_EXPLAIN_STYLE}
Assumptions: 0-3 short items; [] when the request already says it.`;

export function plannerMessages(prompt: string, designBrief: string, L: AppBuildLimits, extra: { answers?: string; previous?: AppSpec | null }): Msg[] {
  const scope = !L.backend
    ? `SCOPE: Free plan, front-end only. No collections, no accounts, no AI actions, no images (draw with SVG/CSS). Anything that would need shared data uses keplar.local (per-visitor) instead; list what is missing in notBuilt. Keep it to ${L.maxFiles} files and make every screen excellent.`
    : `SCOPE: full stack. Backend available (collections up to ${L.collections}, accounts, file uploads, realtime).${L.ai ? " AI actions available (server-side proxy; plan them whenever the idea involves generating, summarizing, quizzing, chatting, recommending, classifying)." : " AI actions are NOT available on this plan (list them in notBuilt)."} ${L.images ? `Up to ${L.images} generated images (only where a real image beats SVG: hero/editorial photography, illustrations, textures).` : "No generated images on this plan: draw with SVG/CSS."}`;
  return [
    {
      role: "system",
      content: `${todayLine()}\n\nYou are the product architect of Keplar, a one-prompt app builder that ships real, working products. You turn a request into a precise build spec that a team of engineers will implement in parallel. Think like a founder + staff engineer + designer: what would make this product genuinely good and complete for its audience?\n\n${scope}\n\n${KIND_GUIDE}\n\n${filePlanRules(L)}\n\n${SCHEMA}`,
    },
    {
      role: "user",
      content: `REQUEST:\n${prompt}\n${extra.answers ? `\nMORE DETAIL FROM THE OWNER:\n${extra.answers}\n` : ""}${extra.previous ? `\nTHIS IS A CHANGE TO AN EXISTING APP. Current spec (keep what is not asked to change, keep collection and field names stable, keep the existing file plan and add to it):\n${JSON.stringify(extra.previous).slice(0, 16000)}\nAlso add a key "changes": [{"path": "file to write or rewrite", "what": "exactly what to change in it"}] listing only the files this change needs (new files must also be in "files"). Use the fewest files that do the job.\n` : ""}\nDESIGN DIRECTION (for images, copy voice and screen composition):\n${designBrief}\n\nReturn the JSON spec.`,
    },
  ];
}

export async function planApp(o: { prompt: string; designBrief: string; L: AppBuildLimits; chain: AppModel[]; deadline: number; answers?: string; previous?: AppSpec | null; onDelta?: (d: string, total: number) => void }): Promise<{ spec: AppSpec; usd: number; model: string; changes: { path: string; what: string }[] }> {
  const r = await llm(o.chain, plannerMessages(o.prompt, o.designBrief, o.L, o), {
    maxTokens: 9000,
    temperature: 0.4,
    deadline: o.deadline,
    json: true,
    reasoning: "low",
    onDelta: o.onDelta,
    accept: (t) => {
      const j = parseJsonObject(t) as Record<string, unknown> | null;
      return Boolean(j && Array.isArray(j.pages) && Array.isArray(j.features));
    },
  });
  const raw = parseJsonObject(r.text) as Record<string, unknown> | null;
  const spec = normalizeSpec(raw, o.L, o.prompt);
  const paths = new Set(spec.files.map((f) => f.path));
  const changes = (Array.isArray(raw?.changes) ? raw!.changes : [])
    .map((c) => ({ path: String((c as Record<string, unknown>)?.path ?? "").replace(/^\.?\//, "").toLowerCase(), what: String((c as Record<string, unknown>)?.what ?? "").slice(0, 600) }))
    .filter((c) => paths.has(c.path) && c.path !== "index.html")
    .slice(0, o.L.maxFiles);
  return { spec, usd: r.usd, model: r.model.id, changes };
}
