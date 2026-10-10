/**
 * The chat's intent router: everything a /app tab can do, asked for in the main chat.
 *
 * Two ways in, one result:
 *   explicit  - a slash command at the start of the message (/slides, /quiz, /approvals, /edit BikeFix: add a dark mode ...)
 *   language  - a small set of patterns for clear requests ("make a slideshow about X", "quiz me on Y", "show my pending
 *               approvals", "edit my BikeFix app to add a dark mode"). Follow-ups ("make slide 3 shorter", "quiz me again",
 *               "switch it to dark mode", "publish it") act on the most recent card in the thread.
 *
 * The router is deliberately conservative: a question ("how do I make a good presentation?") or anything it is not sure about
 * returns null (a normal answer), and a bare topic that names a tool ("presentation on climate change") returns a choice card.
 * Pure and client-safe: no React, no server imports.
 */
import { examDateFrom, localDay } from "@/lib/study/exam-date";
import { cronFromWords } from "@/lib/business/cron-form";
import type { DeckTheme } from "@/lib/slides/types";

export type WorkspaceKind = "apps" | "approvals" | "crm" | "leads" | "dashboard" | "orders" | "agents" | "projects" | "deployments" | "history";
export type StudyFocus = "overview" | "cards" | "quiz" | "plan" | "placement";

/** The most recent card in the thread a follow-up can act on. */
export type LastCard =
  | { kind: "slides"; deckId: string; count?: number }
  | { kind: "study"; setId: string }
  | { kind: "create"; appId: string; name?: string }
  | { kind: "workspace"; card: WorkspaceKind };

export type AgentAct = { type: "run" | "pause" | "resume"; name: string } | { type: "schedule"; name: string; cron: string; words: string };
export type ProjectAct =
  | { type: "create-project"; name: string }
  | { type: "rename-project"; name: string; to: string }
  | { type: "delete-project"; name: string }
  | { type: "merge-projects"; name: string; into: string };
/** History: rename the chat you are in, or delete a chat (this one, or the one a query finds). */
export type ChatAct = { type: "rename-chat"; to: string } | { type: "delete-chat"; query?: string };
export type WorkspaceAct = AgentAct | ProjectAct | ChatAct;
export const isAgentAct = (a: WorkspaceAct | undefined | null): a is AgentAct => !!a && (a.type === "run" || a.type === "pause" || a.type === "resume" || a.type === "schedule");

export type Choice = { label: string; hint: string; intent: Intent | null };

export type Intent =
  | { type: "slides.new"; brief: string }
  | { type: "slides.edit"; deckId: string; index: number; instruction: string }
  | { type: "slides.theme"; deckId: string; theme: DeckTheme }
  | { type: "slides.present"; deckId: string }
  | { type: "slides.move"; deckId: string; from: number; to: number }
  | { type: "slides.delete"; deckId: string; index: number }
  | { type: "study.new"; topic: string; focus: StudyFocus }
  | { type: "study.again"; setId: string; focus: StudyFocus; examDate?: string }
  | { type: "create.new"; prompt: string }
  | { type: "create.edit"; appId?: string; appName?: string; instruction: string }
  | { type: "create.theme"; appId?: string; appName?: string; style?: string; mode?: "light" | "dark" }
  | { type: "create.publish" | "create.unpublish"; appId?: string; appName?: string }
  | { type: "create.show"; appId: string }
  | { type: "create.domain"; appId?: string; appName?: string; hostname?: string }
  | { type: "workspace"; card: WorkspaceKind; query?: string; act?: WorkspaceAct }
  | { type: "agent.new" }
  | { type: "choose"; topic: string; choices: Choice[] };

export type Routed = { intent: Intent; via: "slash" | "language" | "follow-up" };

export type RouteContext = { last?: LastCard | null; /** The person's local day (YYYY-MM-DD), for "my exam is on Nov 3"; defaults to the clock. */ today?: string };

/* ───────────── slash commands ───────────── */

export type ChatCommand = { id: string; slash: string; label: string; summary: string; takesText: boolean };

/** The chat's own slash commands (shown in the composer's "/" menu when Create image is off). None clash with the image commands. */
export const CHAT_COMMANDS: readonly ChatCommand[] = [
  { id: "slides", slash: "/slides", label: "Slideshow", summary: "Make a deck from the rest of the message", takesText: true },
  { id: "quiz", slash: "/quiz", label: "Quiz me", summary: "A-D quiz on a topic, right here", takesText: true },
  { id: "flashcards", slash: "/flashcards", label: "Flashcards", summary: "Flip-cards on a topic, right here", takesText: true },
  { id: "study", slash: "/study", label: "Study set", summary: "Outline, flashcards, quiz and mastery", takesText: true },
  { id: "create", slash: "/create", label: "Build an app", summary: "Build a working app or site in the chat", takesText: true },
  { id: "edit", slash: "/edit", label: "Edit an app", summary: "/edit BikeFix: add a dark mode", takesText: true },
  { id: "theme", slash: "/theme", label: "App look", summary: "/theme BikeFix dark, or /theme brutalist", takesText: true },
  { id: "publish", slash: "/publish", label: "Publish an app", summary: "Put an app live (you confirm)", takesText: true },
  { id: "unpublish", slash: "/unpublish", label: "Unpublish an app", summary: "Take an app offline (you confirm)", takesText: true },
  { id: "domains", slash: "/domains", label: "Domains", summary: "Connect your own domain to an app", takesText: true },
  { id: "apps", slash: "/apps", label: "My apps", summary: "Every app you built, with preview and publish", takesText: false },
  { id: "approvals", slash: "/approvals", label: "Approvals", summary: "Drafts waiting for you: approve or reject", takesText: false },
  { id: "agents", slash: "/agents", label: "Agents", summary: "List, run, pause and resume your agents", takesText: true },
  { id: "agent", slash: "/agent", label: "New agent", summary: "Set up an agent workflow from the chat", takesText: true },
  { id: "crm", slash: "/crm", label: "CRM", summary: "Contacts and deals", takesText: false },
  { id: "leads", slash: "/leads", label: "Leads", summary: "New leads from your sites and checkout", takesText: false },
  { id: "dashboard", slash: "/dashboard", label: "Dashboard", summary: "Revenue, orders, leads and traffic", takesText: false },
  { id: "orders", slash: "/orders", label: "Orders", summary: "Orders from your shops: status, refunds, totals", takesText: false },
  { id: "projects", slash: "/projects", label: "Projects", summary: "/projects new, rename A to B, merge A into B, delete A", takesText: true },
  { id: "deployments", slash: "/deployments", label: "Deployments", summary: "What is live, and where", takesText: false },
  { id: "history", slash: "/history", label: "History", summary: "Find a chat (/history taxes), /history rename, /history delete", takesText: true },
];

const COMMAND_BY_ID = new Map(CHAT_COMMANDS.map((c) => [c.id, c]));

/** The open "/" token at the caret, when the message starts with it (chat commands only lead a message). */
export function chatSlashToken(text: string, caret: number): { query: string; end: number } | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const m = /^\s*(\/[a-z]*)$/i.exec(before);
  return m ? { query: m[1], end: before.length } : null;
}

export function filterChatCommands(query: string): ChatCommand[] {
  const q = query.replace(/^\//, "").toLowerCase();
  if (!q) return [...CHAT_COMMANDS];
  const starts = CHAT_COMMANDS.filter((c) => c.id.startsWith(q));
  const label = CHAT_COMMANDS.filter((c) => !c.id.startsWith(q) && c.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  return [...starts, ...label];
}

export function parseChatSlash(text: string): { command: ChatCommand; rest: string } | null {
  const m = /^\s*\/([a-z]+)\b[\s:]*([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const command = COMMAND_BY_ID.get(m[1].toLowerCase());
  return command ? { command, rest: m[2].trim() } : null;
}

/* ───────────── helpers ───────────── */

const clean = (t: string) => t.replace(/\s+/g, " ").trim();
const stripEnd = (t: string) => t.replace(/[\s.!?]+$/, "").trim();
/** "this" / "that" / "it" / "the above": the topic is the conversation so far. */
const DEICTIC = /^(?:this|that|it|these|those|the above|above|the answer|your answer|what you (?:just )?(?:said|wrote))$/i;
export const isDeictic = (topic: string) => !topic || DEICTIC.test(stripEnd(topic));

/** A question about how to do something, not a request to do it. */
const QUESTION = /^(?:how|what|why|when|where|which|who|whose|is|are|was|were|should|does|do|did|am|explain|tell me (?:how|why|what))\b/i;
const POLITE = /^(?:(?:hey|hi|ok|okay|so|now|and|also|then)[,\s]+)*(?:please\s+)?(?:(?:can|could|would|will) you\s+(?:please\s+)?|i (?:want|need|would like|'d like) (?:you )?to\s+|let'?s\s+|help me\s+)?/i;
const requestBody = (text: string) => clean(text).replace(POLITE, "").replace(/^please\s+/i, "");
const isQuestion = (text: string) => {
  const t = clean(text);
  if (/^(?:can|could|would|will) you\b/i.test(t)) return false;
  return QUESTION.test(t);
};

const NUMBER_WORDS: Record<string, number> = { first: 1, one: 1, second: 2, two: 2, third: 3, three: 3, fourth: 4, four: 4, fifth: 5, five: 5, sixth: 6, six: 6, seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9, tenth: 10, ten: 10, eleventh: 11, eleven: 11, twelfth: 12, twelve: 12 };

/** "slide 3", "the third slide", "slide three", "the last slide" -> 0-based index (needs the deck size for "last"). */
export function slideIndexFrom(text: string, count?: number): number | null {
  const t = text.toLowerCase();
  let m = /\bslide\s*(?:#|no\.?|number)?\s*(\d{1,2})\b/.exec(t);
  if (m) return Number(m[1]) - 1;
  m = /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\s+slide\b/.exec(t);
  if (m) return Number(m[1]) - 1;
  m = /\bslide\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.exec(t);
  if (m) return NUMBER_WORDS[m[1]] - 1;
  m = /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+slide\b/.exec(t);
  if (m) return NUMBER_WORDS[m[1]] - 1;
  if (/\b(?:the\s+)?(?:last|final|closing)\s+slide\b/.test(t)) return count ? count - 1 : null;
  if (/\b(?:the\s+)?(?:title|opening|cover)\s+slide\b/.test(t)) return 0;
  return null;
}

const DECK_THEMES: { theme: DeckTheme; re: RegExp }[] = [
  { theme: "light", re: /\b(?:light|white|bright)\b/i },
  { theme: "dark", re: /\b(?:dark|black|night)\b/i },
  { theme: "brand", re: /\b(?:keplar|brand|monochrome|mono)\b/i },
];

/** App looks the Create builder offers (ids must match STYLE_IDS; a test keeps them in step). */
export const APP_STYLES: { id: string; names: string[] }[] = [
  { id: "editorial", names: ["editorial", "magazine"] },
  { id: "brutalist", names: ["brutalist", "brutal", "brutalism"] },
  { id: "playful", names: ["playful", "fun"] },
  { id: "luxury", names: ["luxury", "luxurious", "premium"] },
  { id: "minimal", names: ["minimal", "minimalist", "clean"] },
  { id: "retro", names: ["retro", "vintage"] },
  { id: "glassy", names: ["glassy", "glass", "glassmorphism"] },
  { id: "dimensional", names: ["3d", "dimensional"] },
  { id: "swiss", names: ["swiss", "swiss grid"] },
  { id: "organic", names: ["organic", "earthy"] },
  { id: "terminal", names: ["terminal", "hacker", "monospace"] },
  { id: "y2k", names: ["y2k"] },
];

export function appStyleFrom(text: string): string | undefined {
  const t = ` ${text.toLowerCase()} `;
  for (const s of APP_STYLES) for (const n of s.names) if (new RegExp(`[^a-z0-9]${n.replace(/\s+/g, "\\s+")}[^a-z0-9]`).test(t)) return s.id;
  return undefined;
}

const modeFrom = (text: string): "light" | "dark" | undefined => (/\bdark\b/i.test(text) ? "dark" : /\blight\b/i.test(text) ? "light" : undefined);

const APP_NOUN = "(?:app|site|website|web ?app|page|landing page|store|shop)";
/** "my BikeFix app", "the BikeFix site" -> "BikeFix" (null for "my app" / "the app"). */
export function appNameFrom(text: string): string | null {
  const m = new RegExp(`\\b(?:my|the|our)\\s+(?:new\\s+)?([\\w][\\w'&.-]*(?:\\s+[\\w][\\w'&.-]*){0,3}?)\\s+${APP_NOUN}\\b`, "i").exec(text);
  if (!m) return null;
  // "the look of my BikeFix app": the name is what follows the last my/the/our.
  const name = m[1].replace(/^.*\b(?:my|the|our)\s+(?:new\s+)?/i, "").trim();
  if (!name) return null;
  if (/^(?:new|current|last|latest|whole|entire|own|this|that|web|landing)$/i.test(name)) return null;
  return name;
}

/* ───────────── language patterns ───────────── */

const DECK_NOUN = /\b(?:slide ?shows?|slide ?decks?|decks?|presentations?|slides|power ?points?|ppts?|keynotes?|pitch decks?)\b/i;
const MAKE = "(?:make|create|build|generate|write|draft|prepare|put together|design|produce|give me|get me|do|whip up|turn)";

function slidesIntent(text: string, body: string): Intent | null {
  if (!DECK_NOUN.test(body)) return null;
  // "turn this into slides", "make this a presentation"
  if (/^(?:turn|make|convert|change)\s+(?:this|that|it|the above|your answer)\s+(?:in)?to\s+(?:an?\s+)?/i.test(body) || /^(?:turn|make)\s+(?:this|that|it)\s+(?:an?\s+)?(?:slide|deck|presentation)/i.test(body)) return { type: "slides.new", brief: "" };
  const m = new RegExp(`^${MAKE}\\s+(?:me\\s+|us\\s+)?(?:an?\\s+|the\\s+|some\\s+)?(?:\\d{1,2}[- ]?(?:slide|page)s?\\s+|short\\s+|quick\\s+|new\\s+)*(?:slide ?show|slide ?deck|deck|presentation|slides|power ?point|ppt|keynote|pitch deck)s?\\b(.*)$`, "i").exec(body);
  if (!m) return null;
  const rest = m[1].replace(/^\s*(?:about|on|for|covering|explaining|that explains|to explain|introducing|of|regarding)\s+/i, "").trim();
  return { type: "slides.new", brief: isDeictic(rest) ? "" : clean(text) };
}

function studyIntent(body: string): Intent | null {
  let m = /^(?:quiz|test|drill)\s+me\b(?:\s+(?:again|more))?(?:\s+(?:on|about|over|in))?\s*(.*)$/i.exec(body);
  if (m) return { type: "study.new", topic: stripEnd(m[1]), focus: "quiz" };
  m = new RegExp(`^${MAKE}\\s+(?:me\\s+)?(?:an?\\s+|some\\s+)?(?:\\d{1,3}\\s+)?(flash ?cards?|quiz(?:zes)?|quiz questions|practice questions|study set|study guide)\\b(?:\\s+(?:on|about|for|covering|from|of))?\\s*(.*)$`, "i").exec(body);
  if (m) return { type: "study.new", topic: stripEnd(m[2]), focus: /flash/i.test(m[1]) ? "cards" : /quiz|question/i.test(m[1]) ? "quiz" : "overview" };
  m = /^(?:help me\s+)?(?:study|revise|memori[sz]e|learn)\s+(?:for\s+)?(.+?)\s+with\s+(flash ?cards|a quiz|quizzes)$/i.exec(body);
  if (m) return { type: "study.new", topic: stripEnd(m[1]), focus: /flash/i.test(m[2]) ? "cards" : "quiz" };
  return null;
}

function createIntent(text: string, body: string, last?: LastCard | null): Intent | null {
  const lastApp = last?.kind === "create" ? last : null;
  // connect bikefix.com to my BikeFix app / use shop.bikefix.com for my site / add a custom domain to my app
  const dom = domainAsk(stripEnd(body), lastApp);
  if (dom) return dom;
  // edit my BikeFix app to add a dark mode / update the BikeFix site so that ... / add a booking form to my BikeFix app
  let m = new RegExp(`^(?:edit|update|change|modify|tweak|fix|improve|redesign)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}\\s*(?:to|so(?: that)?|and|by|with|:|,)\\s*(.+)$`, "i").exec(body);
  if (m) {
    const name = m[1]?.trim() || undefined;
    const instruction = stripEnd(m[2]);
    const theme = themeOnly(instruction);
    if (theme) return { type: "create.theme", ...(name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {}), ...theme };
    return { type: "create.edit", ...(name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {}), instruction };
  }
  m = new RegExp(`^(add|put|include|remove|delete|drop)\\s+(.+?)\\s+(?:to|on|in|into|from)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}\\s*$`, "i").exec(stripEnd(body));
  if (m) {
    const name = m[3]?.trim() || undefined;
    return { type: "create.edit", ...(name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {}), instruction: `${m[1].toLowerCase()} ${m[2]}` };
  }
  // switch my BikeFix app to dark mode / make my site brutalist / change the theme of my app to luxury
  m = new RegExp(`^(?:switch|change|set|make|turn|restyle|give)\\s+(?:the (?:theme|look|style) of\\s+)?(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}(?:'s)?\\s+(?:(?:theme|look|style)\\s+)?(?:to|into|in|a)?\\s*(.+)$`, "i").exec(stripEnd(body));
  if (m) {
    const theme = themeOnly(m[2]);
    const name = m[1]?.trim() || undefined;
    if (theme) return { type: "create.theme", ...(name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {}), ...theme };
  }
  // publish my BikeFix app / unpublish the site / take my BikeFix site down
  m = new RegExp(`^(publish|unpublish|deploy|launch|take down|take offline|go live with)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}(?:\\s+(?:down|offline|live))?$`, "i").exec(stripEnd(body));
  if (m) {
    const name = m[2]?.trim() || undefined;
    const off = /^(?:unpublish|take)/i.test(m[1]);
    return { type: off ? "create.unpublish" : "create.publish", ...(name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {}) };
  }
  m = new RegExp(`^take\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}\\s+(?:down|offline)$`, "i").exec(stripEnd(body));
  if (m) return { type: "create.unpublish", ...(m[1]?.trim() ? { appName: m[1].trim() } : lastApp ? { appId: lastApp.appId } : {}) };
  // build me an app that ... / make a website for my bakery
  m = new RegExp(`^(?:build|make|create|code|develop|spin up|whip up)\\s+(?:me\\s+|us\\s+)?(?:an?|my|our)\\s+(?:new\\s+|simple\\s+|small\\s+|quick\\s+)?(?:[\\w'-]+\\s+){0,4}?(?:app|website|web ?app|site|landing page|online store|portfolio site|game)\\b`, "i").exec(body);
  if (m && !/\b(?:image|picture|photo|logo|drawing|icon)\b/i.test(body.slice(0, 40))) return { type: "create.new", prompt: clean(text) };
  return null;
}

const HOST = String.raw`((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})`;

/** Connecting a custom domain to an app, in words. The card then shows the domain ready to add with one click. */
function domainAsk(t: string, lastApp: { appId: string } | null): Intent | null {
  const target = (name?: string) => (name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {});
  let m = new RegExp(`^(?:connect|add|attach|link|use|point|hook up|set up)\\s+(?:the\\s+|my\\s+)?(?:custom\\s+)?(?:domain\\s+)?${HOST}\\s+(?:to|for|with|on|at)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}$`, "i").exec(t);
  if (m) return { type: "create.domain", ...target(m[2]?.trim()), hostname: m[1].toLowerCase() };
  m = new RegExp(`^(?:connect|add|attach|set up|use)\\s+(?:a|my|the|our)\\s+(?:own\\s+|custom\\s+)?domain\\s+(?:to|for|with|on)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}$`, "i").exec(t);
  if (m) return { type: "create.domain", ...target(m[1]?.trim()) };
  m = new RegExp(`^(?:show|manage|check)\\s+(?:the\\s+)?domains?\\s+(?:of|for|on)\\s+(?:my|the|our)\\s+(.+?\\s+)?${APP_NOUN}$`, "i").exec(t);
  if (m) return { type: "create.domain", ...target(m[1]?.trim()) };
  return null;
}

/** An instruction that only changes the look: "dark mode", "light", "the brutalist style". Feature requests ("a dark mode toggle") are edits. */
function themeOnly(instruction: string): { style?: string; mode?: "light" | "dark" } | null {
  const t = stripEnd(instruction).toLowerCase();
  if (/\b(?:toggle|switch(?:er)?|button|option|setting)\b/.test(t) || /^(?:add|include|support)\b/.test(t)) return null;
  const words = t.replace(/\b(?:a|an|the|to|use|using|in|into|look|looks|style|theme|mode|colors?|scheme|feel|version|more|it|please|instead)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const style = appStyleFrom(t);
  const mode = modeFrom(t);
  if (!style && !mode) return null;
  // Everything said is about the look (style and/or light/dark), nothing else.
  const leftover = words.split(" ").filter((w) => w && w !== "dark" && w !== "light" && !APP_STYLES.some((s) => s.names.some((n) => n.split(" ").includes(w))));
  if (leftover.length > 1) return null;
  return { ...(style ? { style } : {}), ...(mode ? { mode } : {}) };
}

const SHOW = "(?:show|list|see|view|check|open|display|pull up|bring up|get|give me|what(?:'s| is| are)|any|are there(?: any)?|do i have(?: any)?|how many)";

function workspaceIntent(body: string): Intent | null {
  const t = stripEnd(body);
  const own = (noun: string) => new RegExp(`^${SHOW}\\s+(?:me\\s+)?(?:(?:all|the|my|our|me my)\\s+)*(?:(?:new|recent|latest|current|open|pending|outstanding|waiting|active|live)\\s+)*${noun}\\b`, "i");
  if (own("approvals?").test(t) || /^(?:anything|what(?:'s| is))\s+(?:waiting|pending)\s+(?:for\s+)?(?:my\s+)?(?:approval|me to approve)/i.test(t) || /^(?:anything|is there anything)\s+(?:for me\s+)?to approve/i.test(t)) return { type: "workspace", card: "approvals" };
  // agents: run / pause / resume one by name; list them; set up a new one
  const sched = agentScheduleAct(t);
  if (sched) return { type: "workspace", card: "agents", act: sched };
  let m = /^(run|start|trigger|pause|stop|halt|resume|unpause|restart|reactivate)\s+(?:my|the|our)\s+(.+?)\s+agent(?:\s+now)?$/i.exec(t);
  if (m) {
    const v = m[1].toLowerCase();
    const type: "run" | "pause" | "resume" = v === "pause" || v === "stop" || v === "halt" ? "pause" : v === "resume" || v === "unpause" || v === "restart" || v === "reactivate" ? "resume" : "run";
    return { type: "workspace", card: "agents", act: { type, name: m[2].trim() } };
  }
  if (/^(?:set up|setup|create|make|build|add|start)\s+(?:me\s+)?(?:an?|a new|new)\s+agent\b/i.test(t)) return { type: "agent.new" };
  if (own("agents?").test(t) || /^my agents$/i.test(t)) return { type: "workspace", card: "agents" };
  if (own("(?:leads|new leads|form (?:submissions|messages))").test(t) || /^(?:did i get|have i got|got) any (?:new )?leads/i.test(t)) return { type: "workspace", card: "leads" };
  if (own("(?:crm|contacts|customers|clients|deals|pipeline|sales pipeline)").test(t)) return { type: "workspace", card: "crm" };
  if (own("(?:orders|shop orders|store orders|purchases)").test(t) || /^(?:did i get|have i got|got|any) (?:any )?(?:new )?orders\b/i.test(t) || /^my (?:recent |new |latest )?orders$/i.test(t)) return { type: "workspace", card: "orders" };
  if (own("(?:business )?(?:dashboard|numbers|stats|metrics|kpis|revenue|sales)").test(t) || /^how(?:'s| is| are)\s+(?:my|our)\s+(?:business|sales|store|shop|revenue)\b/i.test(t)) return { type: "workspace", card: "dashboard" };
  if (own("(?:deployments|deployed sites|published (?:sites|apps)|live (?:sites|apps))").test(t) || /^what(?:'s| is) live\b/i.test(t)) return { type: "workspace", card: "deployments" };
  if (own("(?:apps|sites|websites|app projects)").test(t) || /^my apps$/i.test(t)) return { type: "workspace", card: "apps" };
  const proj = projectAct(t);
  if (proj) return { type: "workspace", card: "projects", act: proj };
  const chat = chatAct(t);
  if (chat) return { type: "workspace", card: "history", act: chat, ...(chat.type === "delete-chat" && chat.query ? { query: chat.query } : {}) };
  m = /^(?:create|make|start|add|new)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)?\s*["“]?(.+?)["”]?$/i.exec(t);
  if (m && m[1].length <= 60) return { type: "workspace", card: "projects", act: { type: "create-project", name: m[1].trim() } };
  if (own("projects?").test(t)) return { type: "workspace", card: "projects" };
  m = /^(?:find|search(?: for)?|open|show(?: me)?|pull up|where(?:'s| is))\s+(?:my|the|our|that)\s+(?:old\s+|past\s+|previous\s+)?(?:chat|chats|conversation|conversations|thread|threads)\s+(?:about|on|with|where|that|from|mentioning|regarding)\s+(.+)$/i.exec(t);
  if (m) return { type: "workspace", card: "history", query: m[1].replace(/^(?:we|i)\s+(?:talked|asked|discussed|chatted)\s+about\s+/i, "").trim() };
  if (own("(?:chat )?(?:history|recent chats|past chats|chats|conversations)").test(t)) return { type: "workspace", card: "history" };
  return null;
}

const Q = "[\"“”']?";
const unq = (v: string) => v.replace(/^["“”']+|["“”']+$/g, "").replace(/\s+project$/i, "").trim().slice(0, 60);

/** rename project A to B / delete the A project / merge project A into B. */
export function projectAct(text: string): ProjectAct | null {
  const t = stripEnd(text);
  let m = new RegExp(`^rename\\s+(?:my\\s+|the\\s+)?project\\s+${Q}(.+?)${Q}\\s+(?:to|as)\\s+${Q}(.+?)${Q}$`, "i").exec(t)
    ?? new RegExp(`^rename\\s+(?:my\\s+|the\\s+)?${Q}(.+?)${Q}\\s+project\\s+(?:to|as)\\s+${Q}(.+?)${Q}$`, "i").exec(t);
  if (m) return { type: "rename-project", name: unq(m[1]), to: unq(m[2]) };
  m = new RegExp(`^(?:delete|remove|get rid of)\\s+(?:my\\s+|the\\s+)?project\\s+${Q}(.+?)${Q}$`, "i").exec(t)
    ?? new RegExp(`^(?:delete|remove|get rid of)\\s+(?:my\\s+|the\\s+)?${Q}(.+?)${Q}\\s+project$`, "i").exec(t);
  if (m) return { type: "delete-project", name: unq(m[1]) };
  m = new RegExp(`^(?:merge|combine|fold)\\s+(?:my\\s+|the\\s+)?(?:project\\s+)?${Q}(.+?)${Q}\\s+(?:project\\s+)?(?:into|with)\\s+(?:my\\s+|the\\s+)?(?:project\\s+)?${Q}(.+?)${Q}$`, "i").exec(t);
  if (m && /\bprojects?\b/i.test(t)) return { type: "merge-projects", name: unq(m[1]), into: unq(m[2]) };
  return null;
}

/**
 * A new schedule for an agent, in words: "run my daily brief every weekday at 9am", "change my lead follow-up agent to every Monday
 * at 10", "schedule the weekly report agent for Fridays at 4pm". Only when the schedule part reads as one (cronFromWords).
 */
export function agentScheduleAct(text: string): AgentAct | null {
  const t = stripEnd(text);
  const m = /^(?:run|schedule|reschedule|set|change|move|switch|make)\s+(?:my|the|our)\s+(.+?)(?:\s+agent)?\s+(?:to\s+run\s+|so\s+it\s+runs\s+|to\s+|for\s+)?((?:every|each|daily|weekly|hourly|weekdays|on\s+weekdays|once|(?:on\s+)?(?:sun|mon|tues|wednes|thurs|fri|satur)days?)\b.*)$/i.exec(t);
  if (!m) return null;
  // "make my app every day" is not about an agent: other verbs need the word "agent".
  if (!/^(?:run|schedule|reschedule)\b/i.test(t) && !/\bagent\b/i.test(t)) return null;
  const name = m[1].replace(/\s+agent$/i, "").trim();
  const words = m[2].replace(/^(?:on\s+)?(?=(?:sun|mon|tues|wednes|thurs|fri|satur)days?\b)/i, "every ").trim();
  const cron = cronFromWords(words);
  return cron && name ? { type: "schedule", name, cron, words } : null;
}

/** rename this chat to X / delete this chat / delete my chat about X. */
export function chatAct(text: string): ChatAct | null {
  const t = stripEnd(text);
  let m = /^(?:rename|retitle|call)\s+(?:this|the current|my current)\s+(?:chat|conversation|thread)\s+(?:to\s+|as\s+)?["“']?(.+?)["”']?$/i.exec(t);
  if (m) return { type: "rename-chat", to: m[1].trim().slice(0, 120) };
  if (/^(?:delete|remove|erase|trash)\s+(?:this|the current|my current)\s+(?:chat|conversation|thread)$/i.test(t)) return { type: "delete-chat" };
  m = /^(?:delete|remove|erase|trash)\s+(?:my|the|that)\s+(?:old\s+)?(?:chat|conversation|thread)\s+(?:about|on|with|mentioning|called|named)\s+["“']?(.+?)["”']?$/i.exec(t);
  if (m) return { type: "delete-chat", query: m[1].trim().slice(0, 80) };
  return null;
}

const SLIDE_REF = String.raw`(?:the\s+)?(?:slide\s*(?:#|no\.?|number)?\s*\d{1,2}|slide\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final|closing|title|opening|cover)\s+slide)`;

/**
 * Hand edits to the deck on the last card, by number: "move slide 4 to 2", "move the last slide up", "move slide 3 to the end",
 * "delete slide 5". Only whole-sentence commands about one slide (a rewrite like "remove the chart from slide 3" is slides.edit).
 */
export function slideHandEdit(text: string, count?: number): { type: "move"; from: number; to: number } | { type: "delete"; index: number } | null {
  const t = stripEnd(text);
  let m = new RegExp(`^(?:please\\s+)?(?:delete|remove|drop|cut|trash|get rid of)\\s+(${SLIDE_REF})$`, "i").exec(t);
  if (m) {
    const index = slideIndexFrom(m[1], count);
    return index === null || index < 0 || (count !== undefined && index >= count) ? null : { type: "delete", index };
  }
  m = new RegExp(`^(?:please\\s+)?(?:move|put)\\s+(${SLIDE_REF})\\s+(.+)$`, "i").exec(t);
  if (!m) return null;
  const from = slideIndexFrom(m[1], count);
  if (from === null || from < 0 || (count !== undefined && from >= count)) return null;
  const where = m[2].toLowerCase().trim();
  const last = count !== undefined ? count - 1 : 98;
  let to: number | null = null;
  let n: RegExpExecArray | null;
  if ((n = /^(?:to\s+)?(?:position|slot|place|spot|number)?\s*(?:to\s+)?(?:be\s+)?(?:slide\s+)?#?(\d{1,2})$/.exec(where)) && /^(?:to|position|slot|place|spot|number)/.test(where)) to = Number(n[1]) - 1;
  else if (/^(?:up|earlier|forward|back one|one (?:up|earlier))$/.test(where)) to = from - 1;
  else if (/^(?:down|later|one (?:down|later))$/.test(where)) to = from + 1;
  else if (/^(?:to\s+)?(?:the\s+)?(?:start|beginning|front|top)(?:\s+of the deck)?$|^first$|^to (?:be )?(?:the )?first(?: slide)?$/.test(where)) to = 0;
  else if (/^(?:to\s+)?(?:the\s+)?(?:end|back|bottom)(?:\s+of the deck)?$|^last$|^to (?:be )?(?:the )?last(?: slide)?$/.test(where)) to = last;
  else if ((n = /^(?:before|ahead of)\s+(.+)$/.exec(where))) { const b = slideIndexFrom(n[1], count); if (b !== null) to = b > from ? b - 1 : b; }
  else if ((n = /^after\s+(.+)$/.exec(where))) { const a = slideIndexFrom(n[1], count); if (a !== null) to = a >= from ? a : a + 1; }
  if (to === null || to < 0 || to > last || to === from) return null;
  return { type: "move", from, to };
}

/**
 * Study set follow-ups for the exam plan and the placement quiz: "my exam is on Nov 3", "set my exam date to 2026-11-03", "clear
 * my exam date", "show my study plan", "take the placement quiz". An exam date that can't be read opens the Plan tab to pick it.
 */
export function studyFollowUp(text: string, today: string): { focus: StudyFocus; examDate?: string } | null {
  const t = stripEnd(text);
  if (/^(?:take|start|do|run|try)\s+(?:the|a|my)\s+(?:placement|diagnostic)(?:\s+(?:quiz|test|exam))?$|^(?:placement|diagnostic)(?:\s+(?:quiz|test))?$|^find my weak (?:spots|topics|areas)$/i.test(t)) return { focus: "placement" };
  if (/^(?:show|open|see|what(?:'s| is))\s+(?:me\s+)?(?:my\s+(?:study\s+)?plan|the\s+study\s+plan)$|^(?:my\s+)?study plan$|^plan my studying$/i.test(t)) return { focus: "plan" };
  if (/^(?:clear|remove|delete|drop|unset)\s+(?:my|the)\s+exam(?:\s+date)?$|^i (?:don't|do not) have an exam(?: date)?$/i.test(t)) return { focus: "plan", examDate: "" };
  const m = /^(?:set|change|move|update|make)\s+(?:my|the)\s+exam(?:\s+date)?\s+(?:to|for|as)\s+(.+)$|^(?:my|the)\s+(?:exam|test|final)\s+is\s+(.+)$|^exam(?:\s+date)?\s*(?:is|:)\s*(.+)$/i.exec(t);
  if (!m) return null;
  const when = (m[1] ?? m[2] ?? m[3]).trim();
  const date = examDateFrom(when, today);
  return date ? { focus: "plan", examDate: date } : { focus: "plan" };
}

/** Follow-ups that act on the most recent card. */
function followUp(body: string, last: LastCard, today: string): Intent | null {
  const t = stripEnd(body);
  if (last.kind === "slides") {
    const hand = slideHandEdit(t, last.count);
    if (hand?.type === "move") return { type: "slides.move", deckId: last.deckId, from: hand.from, to: hand.to };
    if (hand?.type === "delete") return { type: "slides.delete", deckId: last.deckId, index: hand.index };
    const idx = slideIndexFrom(t, last.count);
    if (idx !== null && idx >= 0 && (last.count === undefined || idx < last.count) && /\b(?:make|rewrite|redo|change|shorten|shorter|expand|longer|simplify|simpler|add|remove|drop|replace|fix|update|edit|tighten|punchier|reword|rephrase|turn|more|less|use|focus|split|cut|trim|improve|clarify)\b/i.test(t)) {
      return { type: "slides.edit", deckId: last.deckId, index: idx, instruction: t };
    }
    if (/\b(?:theme|look|background|colors?|mode)\b/i.test(t) || /^(?:switch|change|make|use|go|try)\b.*\b(?:dark|light|keplar|brand|monochrome)\b/i.test(t)) {
      const hit = DECK_THEMES.find((d) => d.re.test(t));
      if (hit) return { type: "slides.theme", deckId: last.deckId, theme: hit.theme };
    }
    if (/^(?:present|start the presentation|present it|play it|go fullscreen|full ?screen)$/i.test(t)) return { type: "slides.present", deckId: last.deckId };
  }
  if (last.kind === "study") {
    if (/^(?:quiz|test|drill)\s+me(?:\s+(?:again|more|on (?:this|it|that)))?$/i.test(t) || /^(?:another|one more|new|again|more)\s*(?:quiz|round)?$/i.test(t) || /^(?:start|take|do)\s+(?:the|a)\s+quiz$/i.test(t)) return { type: "study.again", setId: last.setId, focus: "quiz" };
    if (/^(?:show|practice|review|do|go through|study)\s+(?:me\s+)?(?:the\s+)?flash ?cards(?:\s+again)?$/i.test(t) || /^flash ?cards$/i.test(t)) return { type: "study.again", setId: last.setId, focus: "cards" };
    if (/^(?:how am i doing|what(?:'s| is) my (?:mastery|score|progress)|show (?:my )?(?:mastery|progress))$/i.test(t)) return { type: "study.again", setId: last.setId, focus: "overview" };
    const ex = studyFollowUp(t, today);
    if (ex) return { type: "study.again", setId: last.setId, ...ex };
  }
  if (last.kind === "create") {
    const dm = new RegExp(`^(?:connect|add|attach|use|point|set up)\\s+(?:the\\s+|my\\s+)?(?:custom\\s+)?(?:domain\\s+)?${HOST}(?:\\s+(?:to|for|with|on)\\s+(?:it|this|this app|the app|the site))?$`, "i").exec(t);
    if (dm) return { type: "create.domain", appId: last.appId, hostname: dm[1].toLowerCase() };
    if (/^(?:connect|add|set up|use)\s+(?:a|my|the)\s+(?:own\s+|custom\s+)?domain(?:\s+(?:to|for)\s+(?:it|this|the app|the site))?$|^(?:show\s+)?(?:the\s+)?domains$/i.test(t)) return { type: "create.domain", appId: last.appId };
    if (/^(?:publish|deploy|launch|ship)\s+(?:it|this|that|the app|the site)(?:\s+(?:now|live))?$/i.test(t) || /^(?:make it|put it|go) live$/i.test(t)) return { type: "create.publish", appId: last.appId };
    if (/^(?:unpublish|take down)\s+(?:it|this|that|the app|the site)$/i.test(t) || /^take (?:it|this|the app|the site) (?:down|offline)$/i.test(t)) return { type: "create.unpublish", appId: last.appId };
    const lookOnly = /^(?:switch|change|set|make|turn|use|try|go|give it)\b/i.test(t) && /\b(?:it|the app|the site|this|theme|look|style|mode)\b/i.test(t) ? themeOnly(t.replace(/^(?:switch|change|set|make|turn|use|try|go|give)\s+(?:it|the app|the site|this)?\s*(?:to|into|a|an)?\s*/i, "")) : null;
    if (lookOnly) return { type: "create.theme", appId: last.appId, ...lookOnly };
    const editVerb = /^(?:add|change|make|remove|delete|drop|replace|rename|update|fix|move|put|use|show|hide|turn|give it|let|include|swap|increase|decrease|enlarge|shrink|align|center|translate|rewrite)\b/i;
    const appNoun = /\b(?:it|the app|this app|the site|the page|button|buttons|header|footer|section|page|pages|screen|color|colors|font|fonts|logo|menu|nav|navigation|form|hero|dark mode|light mode|title|heading|text|image|images|layout|sidebar|card|cards|price|prices|pricing|checkout|cart|booking|contact|gallery|testimonials?|faq|map|login|sign ?up|search|filter|animation|footer)\b/i;
    if (editVerb.test(t) && appNoun.test(t) && t.length >= 8) return { type: "create.edit", appId: last.appId, instruction: t };
  }
  if (last.kind === "workspace" && last.card === "agents") {
    const m = /^(run|start|pause|stop|resume|unpause)\s+(?:the\s+|my\s+)?(.+?)(?:\s+agent)?(?:\s+now)?$/i.exec(t);
    if (m && m[2].length <= 60 && !/^(?:it|that|this)$/i.test(m[2])) {
      const v = m[1].toLowerCase();
      return { type: "workspace", card: "agents", act: { type: v === "pause" || v === "stop" ? "pause" : v === "resume" || v === "unpause" ? "resume" : "run", name: m[2].trim() } };
    }
  }
  return null;
}

/** A bare topic that names a tool but doesn't ask for it: offer the tool or a normal answer. */
function choiceFor(text: string, body: string): Intent | null {
  const t = stripEnd(body);
  if (t.length > 160 || isQuestion(text)) return null;
  let m = /^(?:an?\s+)?(?:slide ?show|slide ?deck|deck|presentation|slides)\s+(?:about|on|for|covering)\s+(.{3,})$/i.exec(t);
  if (m) return { type: "choose", topic: m[1], choices: [
    { label: "Make the deck", hint: "Slides, with previews, themes, present and export", intent: { type: "slides.new", brief: clean(text) } },
    { label: "Just answer", hint: "A normal Keplar answer", intent: null },
  ] };
  m = /^(?:a\s+)?(?:quiz|flash ?cards|study set|study guide)\s+(?:about|on|for|covering)\s+(.{3,})$/i.exec(t);
  if (m) {
    const cards = /flash/i.test(t);
    return { type: "choose", topic: m[1], choices: [
      { label: cards ? "Make flashcards" : "Quiz me", hint: "A study set right here: flashcards, A-D quiz, mastery", intent: { type: "study.new", topic: m[1], focus: cards ? "cards" : "quiz" } },
      { label: "Just answer", hint: "A normal Keplar answer", intent: null },
    ] };
  }
  return null;
}

/* ───────────── the router ───────────── */

function fromSlash(text: string, ctx: RouteContext): Intent | null {
  const p = parseChatSlash(text);
  if (!p) return null;
  const { command, rest } = p;
  const last = ctx.last ?? null;
  const lastApp = last?.kind === "create" ? last : null;
  const appTarget = (name: string) => (name ? { appName: name } : lastApp ? { appId: lastApp.appId } : {});
  switch (command.id) {
    case "slides":
      if (!rest && last?.kind === "slides") return { type: "slides.present", deckId: last.deckId };
      return { type: "slides.new", brief: isDeictic(rest) ? "" : rest };
    case "quiz":
    case "flashcards":
    case "study": {
      if (command.id === "study" && last?.kind === "study") {
        if (/^(?:plan|exam|exam date|schedule)$/i.test(rest)) return { type: "study.again", setId: last.setId, focus: "plan" };
        if (/^(?:placement|diagnostic)(?:\s+(?:quiz|test))?$/i.test(rest)) return { type: "study.again", setId: last.setId, focus: "placement" };
        const ex = /^exam\s+(.+)$/i.exec(rest);
        if (ex) { const d = examDateFrom(ex[1], localDay()); return { type: "study.again", setId: last.setId, focus: "plan", ...(d ? { examDate: d } : {}) }; }
      }
      const focus: StudyFocus = command.id === "quiz" ? "quiz" : command.id === "flashcards" ? "cards" : "overview";
      if (isDeictic(rest) && last?.kind === "study") return { type: "study.again", setId: last.setId, focus };
      return { type: "study.new", topic: isDeictic(rest) ? "" : rest, focus };
    }
    case "create":
      return rest ? { type: "create.new", prompt: rest } : null;
    case "edit": {
      const m = /^(.+?)\s*:\s*(.+)$/.exec(rest);
      if (m) return { type: "create.edit", appName: m[1].replace(/\s+(?:app|site|website)$/i, "").trim(), instruction: m[2].trim() };
      return rest ? { type: "create.edit", ...appTarget(""), instruction: rest } : null;
    }
    case "theme": {
      const style = appStyleFrom(rest);
      const mode = modeFrom(rest);
      const name = rest.replace(new RegExp(`\\b(?:dark|light|mode|theme|look|style|to|${APP_STYLES.flatMap((s) => s.names).join("|")})\\b`, "gi"), " ").replace(/\s+/g, " ").replace(/\s+(?:app|site|website)$/i, "").trim();
      return style || mode ? { type: "create.theme", ...appTarget(name), ...(style ? { style } : {}), ...(mode ? { mode } : {}) } : { type: "workspace", card: "apps" };
    }
    case "domains": {
      const host = /^((?:[a-z0-9-]+\.)+[a-z]{2,24})(?:\s+(?:to|for|on)\s+(.+))?$/i.exec(rest.trim());
      if (host) return { type: "create.domain", ...appTarget((host[2] ?? "").replace(/^(?:my|the|our)\s+/i, "").replace(/\s+(?:app|site|website)$/i, "").trim()), hostname: host[1].toLowerCase() };
      return { type: "create.domain", ...appTarget(rest.replace(/^(?:for|on)\s+/i, "").replace(/^(?:my|the|our)\s+/i, "").replace(/\s+(?:app|site|website)$/i, "").trim()) };
    }
    case "publish":
    case "unpublish":
      return { type: command.id === "publish" ? "create.publish" : "create.unpublish", ...appTarget(rest.replace(/\s+(?:app|site|website)$/i, "").trim()) };
    case "agent":
      return { type: "agent.new" };
    case "agents": {
      const m = /^(run|pause|resume)\s+(.+)$/i.exec(rest);
      return m ? { type: "workspace", card: "agents", act: { type: m[1].toLowerCase() as "run" | "pause" | "resume", name: m[2].replace(/\s+agent$/i, "").trim() } } : { type: "workspace", card: "agents" };
    }
    case "projects": {
      const m = /^(?:new|create|add)\s+(.+)$/i.exec(rest);
      if (m) return { type: "workspace", card: "projects", act: { type: "create-project", name: m[1].trim().slice(0, 60) } };
      const r = /^rename\s+(.+?)\s+(?:to|as)\s+(.+)$/i.exec(rest);
      if (r) return { type: "workspace", card: "projects", act: { type: "rename-project", name: unq(r[1]), to: unq(r[2]) } };
      const d = /^(?:delete|remove)\s+(.+)$/i.exec(rest);
      if (d) return { type: "workspace", card: "projects", act: { type: "delete-project", name: unq(d[1]) } };
      const g = /^merge\s+(.+?)\s+(?:into|with)\s+(.+)$/i.exec(rest);
      if (g) return { type: "workspace", card: "projects", act: { type: "merge-projects", name: unq(g[1]), into: unq(g[2]) } };
      return { type: "workspace", card: "projects" };
    }
    case "history": {
      const r = /^rename\s+(?:to\s+)?(.+)$/i.exec(rest);
      if (r) return { type: "workspace", card: "history", act: { type: "rename-chat", to: r[1].trim().slice(0, 120) } };
      const d = /^(?:delete|remove)(?:\s+(.+))?$/i.exec(rest);
      if (d) return { type: "workspace", card: "history", act: d[1] && !/^(?:this|this chat|it)$/i.test(d[1].trim()) ? { type: "delete-chat", query: d[1].trim() } : { type: "delete-chat" }, ...(d[1] && !/^(?:this|this chat|it)$/i.test(d[1].trim()) ? { query: d[1].trim() } : {}) };
      return { type: "workspace", card: "history", ...(rest ? { query: rest } : {}) };
    }
    default:
      return { type: "workspace", card: command.id as WorkspaceKind };
  }
}

/**
 * Route one message. Null means "answer normally". Callers only route messages sent with no mode chip on (a chip is already
 * an explicit choice), except slash commands, which always win.
 */
export function routeChat(text: string, ctx: RouteContext = {}): Routed | null {
  const slash = fromSlash(text, ctx);
  if (slash) return { intent: slash, via: "slash" };
  if (/^\s*\//.test(text)) return null;
  const t = clean(text);
  if (t.length < 4 || t.length > 600) return null;
  const body = requestBody(t);
  if (ctx.last) {
    const f = followUp(body, ctx.last, ctx.today ?? localDay());
    if (f) return { intent: f, via: "follow-up" };
  }
  if (isQuestion(t)) {
    // Questions are answered, except the ones that ask to see your own things ("what are my pending approvals?").
    const w = (/\b(?:my|our|i|me)\b/i.test(t) || /^what(?:'s| is) live\b/i.test(t)) ? workspaceIntent(body) : null;
    return w ? { intent: w, via: "language" } : null;
  }
  const hit = workspaceIntent(body) ?? studyIntent(body) ?? slidesIntent(t, body) ?? createIntent(t, body, ctx.last);
  if (hit) return { intent: hit, via: "language" };
  const choice = choiceFor(t, body);
  return choice ? { intent: choice, via: "language" } : null;
}

/** Short label for the user message meta line ("Slides", "Approvals", ...). */
export function intentLabel(i: Intent): string {
  switch (i.type) {
    case "slides.new": case "slides.edit": case "slides.theme": case "slides.present": case "slides.move": case "slides.delete": return "Slides";
    case "study.new": case "study.again": return i.focus === "quiz" ? "Quiz" : i.focus === "cards" ? "Flashcards" : i.focus === "plan" ? "Study plan" : i.focus === "placement" ? "Placement quiz" : "Study";
    case "create.new": case "create.edit": case "create.theme": case "create.publish": case "create.unpublish": case "create.show": case "create.domain": return "Create";
    case "agent.new": return "Agent";
    case "choose": return "";
    case "workspace": return { apps: "Apps", approvals: "Approvals", crm: "CRM", leads: "Leads", dashboard: "Dashboard", orders: "Orders", agents: "Agents", projects: "Projects", deployments: "Deployments", history: "History" }[i.card];
  }
}
