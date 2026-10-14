import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState, reducer, settle } from "@/components/app-ui/state/store";
import { cardHistoryLine, lastCardOf, previousAnswer, previousQuestion } from "@/components/app-ui/state/cards";
import type { KeplarMessage, Message, Thread, UserMessage } from "@/components/app-ui/state/types";
import { matchApp, matchName, money, relDay, threadMatches } from "@/components/app-ui/workspace/workspace-data";

/** The chat's tab cards: which card a follow-up acts on, what persists in the synced thread, and the pure helpers behind them. */
const modes = { web: false, deepResearch: false, create: false, agent: false };
const u = (id: string, text: string): UserMessage => ({ id, role: "user", text, attachments: [], modes, createdAt: 1 });
const k = (id: string, over: Partial<KeplarMessage>): KeplarMessage => ({ id, role: "keplar", replyTo: "u0", status: "done", stages: [], capabilities: [], models: [], draft: "", startedAt: 1, finishedAt: 2, ...over });
const thread = (messages: Message[]): Thread => ({ id: "t1", title: "t", projectId: null, createdAt: 1, updatedAt: 1, messages });

test("cards: a follow-up acts on the most recent card, past plain answers", () => {
  const msgs: Message[] = [
    u("u1", "make a deck about jazz"),
    k("k1", { replyTo: "u1", studio: { kind: "slides", phase: "ready", id: "dk_1", count: 8, title: "Jazz" } }),
    u("u2", "who was Miles Davis?"),
    k("k2", { replyTo: "u2", answer: { markdown: "A trumpeter." } as KeplarMessage["answer"] }),
  ];
  assert.deepEqual(lastCardOf(msgs), { kind: "slides", deckId: "dk_1", count: 8 });
  msgs.push(u("u3", "list my apps"), k("k3", { replyTo: "u3", workspace: { kind: "apps" } }));
  assert.deepEqual(lastCardOf(msgs), { kind: "workspace", card: "apps" });
  msgs.push(u("u4", "edit BikeFix"), k("k4", { replyTo: "u4", create: { phase: "ready", appId: "sit_1", name: "BikeFix" } }));
  assert.deepEqual(lastCardOf(msgs), { kind: "create", appId: "sit_1", name: "BikeFix" });
  msgs.push(u("u5", "quiz me"), k("k5", { replyTo: "u5", studio: { kind: "study", phase: "ready", id: "ss_1", standalone: true } }));
  assert.deepEqual(lastCardOf(msgs), { kind: "study", setId: "ss_1" });
  msgs.push(u("u6", "?"), k("k6", { replyTo: "u6", workspace: { kind: "choose", choices: [] } }));
  assert.deepEqual(lastCardOf(msgs), { kind: "study", setId: "ss_1" }, "a choice card is not something to act on");
  assert.equal(lastCardOf([u("u1", "hi"), k("k1", { replyTo: "u1", studio: { kind: "slides", phase: "failed" } })]), null, "a deck that wasn't made can't be edited");
  assert.equal(previousQuestion(msgs)?.text, "who was Miles Davis?");
  assert.equal(previousAnswer(msgs)?.id, "k2");
});

test("cards: each card adds one honest line to the model's history", () => {
  assert.match(cardHistoryLine(k("a", { workspace: { kind: "approvals" } }))!, /pending approvals/);
  assert.match(cardHistoryLine(k("a", { workspace: { kind: "agents", act: { type: "pause", name: "x" }, acted: { ok: true, text: "Paused Lead sweep." } } }))!, /Paused Lead sweep/);
  assert.match(cardHistoryLine(k("a", { studio: { kind: "slides", phase: "ready", title: "Jazz", op: { type: "slide", index: 2, instruction: "shorter" } } }))!, /rewrote slide 3/);
  assert.match(cardHistoryLine(k("a", { studio: { kind: "slides", phase: "ready", title: "Jazz", count: 8 } }))!, /8-slide deck here: Jazz/);
  assert.match(cardHistoryLine(k("a", { create: { phase: "ready", name: "BikeFix", op: { type: "edit", instruction: "add a dark mode" } } }))!, /changed the app BikeFix: add a dark mode/);
  assert.match(cardHistoryLine(k("a", { create: { phase: "ready", name: "BikeFix", op: { type: "publish" }, opDone: "done" } }))!, /published the app BikeFix/);
  assert.match(cardHistoryLine(k("a", { create: { phase: "ready", name: "BikeFix", op: { type: "publish" } } }))!, /offered to publish/, "never claims a publish that didn't happen");
  assert.equal(cardHistoryLine(k("a", { workspace: { kind: "choose" } })), null);
  assert.equal(cardHistoryLine(k("a", { studio: { kind: "slides", phase: "failed" } })), null);
});

test("cards: workspace cards patch and persist in the thread; a reload keeps them and never repeats an action", () => {
  const t = thread([u("u1", "pause my lead sweep agent"), k("k1", { replyTo: "u1", workspace: { kind: "agents", act: { type: "pause", name: "lead sweep" } } }), k("k2", { replyTo: "u1" })]);
  const s0 = { ...initialState(), threads: [t], activeThreadId: "t1" };
  const s1 = reducer(s0, { type: "workspace", threadId: "t1", keplarId: "k1", patch: { acted: { ok: true, text: "Paused Lead sweep." } } });
  const m = s1.threads[0].messages[1] as KeplarMessage;
  assert.deepEqual(m.workspace, { kind: "agents", act: { type: "pause", name: "lead sweep" }, acted: { ok: true, text: "Paused Lead sweep." } });
  assert.equal(reducer(s0, { type: "workspace", threadId: "t1", keplarId: "k2", patch: { picked: 1 } }).threads[0].messages[2], t.messages[2], "a turn without a workspace card is left alone");
  // What the chat sync and localStorage store is the message itself: JSON round trip + settle keeps every card field.
  const back = settle(JSON.parse(JSON.stringify(s1.threads[0])) as Thread);
  assert.deepEqual((back.messages[1] as KeplarMessage).workspace, m.workspace);
});

test("cards: slides / study follow-ups and app ops survive a reload the honest way", () => {
  const t = thread([
    u("u1", "make slide 3 shorter"),
    k("k1", { replyTo: "u1", studio: { kind: "slides", phase: "working", id: "dk_1", op: { type: "slide", index: 2, instruction: "make slide 3 shorter" }, standalone: true } }),
    u("u2", "quiz me again"),
    k("k2", { replyTo: "u2", studio: { kind: "study", phase: "ready", id: "ss_1", focus: "quiz", standalone: true } }),
    u("u3", "edit my BikeFix app to add a dark mode"),
    k("k3", { replyTo: "u3", create: { phase: "confirm", appId: "sit_1", op: { type: "edit", instruction: "add a dark mode" }, estimate: 400 } }),
  ]);
  const back = settle(JSON.parse(JSON.stringify(t)) as Thread);
  const [, k1, , k2, , k3] = back.messages as KeplarMessage[];
  assert.equal(k1.studio?.phase, "interrupted", "a rewrite that was running is not started again on its own");
  assert.equal(k1.studio?.op?.type, "slide");
  assert.deepEqual(k2.studio, { kind: "study", phase: "ready", id: "ss_1", focus: "quiz", standalone: true });
  assert.deepEqual(k3.create, { phase: "confirm", appId: "sit_1", op: { type: "edit", instruction: "add a dark mode" }, estimate: 400 }, "the confirm step waits for the owner after a reload");
  const s1 = reducer({ ...initialState(), threads: [t], activeThreadId: "t1" }, { type: "studio", threadId: "t1", keplarId: "k1", patch: { phase: "ready", changed: 2, title: "Jazz" } });
  assert.equal((s1.threads[0].messages[1] as KeplarMessage).studio?.changed, 2);
});

test("cards: names, money, days and chat search", () => {
  const agents = [{ id: "a1", name: "Lead sweep" }, { id: "a2", name: "Weekly report" }, { id: "a3", name: "Weekly KPI digest" }];
  assert.deepEqual(matchName(agents, "lead sweep"), { id: "a1" });
  assert.deepEqual(matchName(agents, "the lead-sweep agent"), { id: "a1" });
  assert.deepEqual(matchName(agents, "weekly report"), { id: "a2" });
  assert.equal("choices" in matchName(agents, "weekly") && (matchName(agents, "weekly") as { choices: unknown[] }).choices.length, 2, "two weekly agents: ask which");
  assert.ok("choices" in matchName(agents, "invoices"));
  const apps = [{ id: "s1", name: "New app", appName: "BikeFix" }, { id: "s2", name: "Salon" }];
  assert.deepEqual(matchApp(apps, "bikefix"), { id: "s1" });
  assert.deepEqual(matchApp(apps, "Bike Fix"), { id: "s1" });
  assert.deepEqual(matchApp(apps, "salon booking"), { id: "s2" });
  assert.ok("choices" in matchApp(apps, "Puzzle"));
  assert.deepEqual(matchApp([apps[1]], undefined), { id: "s2" }, "only one app: that one");
  assert.equal(money(123450, "usd"), "$1,234.50");
  assert.equal(money(0), "$0.00");
  const now = new Date("2026-10-06T15:00:00").getTime();
  assert.equal(relDay(new Date("2026-10-06T09:00:00").toISOString(), now), "today");
  assert.equal(relDay(new Date("2026-10-05T09:00:00").toISOString(), now), "yesterday");
  assert.equal(relDay(new Date("2026-10-09T09:00:00").toISOString(), now), "in 3 days");
  const t = thread([u("u1", "what are my tax deductions"), k("k1", { replyTo: "u1", answer: { markdown: "Home office and mileage." } as KeplarMessage["answer"] })]);
  assert.ok(threadMatches(t, "mileage"));
  assert.ok(threadMatches(t, "TAX home"));
  assert.ok(!threadMatches(t, "taxes bitcoin"));
});

/* Static contracts for the card components (the browser checks are the screenshots in screenshots/chat-tabs/). */
const read = (p: string) => readFileSync(p, "utf8");

test("cards: every workspace card links to the same object in its tab, and loads from the tab's own API", () => {
  const src = read("src/components/app-ui/workspace/WorkspaceTurn.tsx");
  for (const label of ["Open in Create", "Open in Approvals", "Open in Business", "Open in Agents", "Open in Projects", "Open in Deployments", "Open in All chats"]) assert.ok(src.includes(label), label);
  for (const api of ["/api/apps", "/api/business/approvals", "/api/business/crm", "/api/business/dashboard", "/api/business/agents", "/api/sites"]) assert.ok(src.includes(`"${api}"`), api);
  assert.ok(src.includes("/api/business/approvals/${a.id}"), "approve / reject through the same approvals route as the tab");
  assert.match(src, /Approve and send/);
  assert.ok(!/autoSend:\s*true/.test(src), "the chat never turns on auto-send");
  const studio = read("src/components/app-ui/studio/StudioTurn.tsx");
  for (const s of ["Open in Study", "Open in Slides", "/regenerate", "/cards?all=1", "/quiz", "/answer", "export?format=pptx", "export?format=pdf", "<Present", "Upgrade to Plus"]) assert.ok(studio.includes(s), s);
  assert.match(studio, /"ABCD"\[k\]/, "A-D quiz answers");
  const create = read("src/components/app-ui/create/CreateTurn.tsx");
  for (const s of ["Open in Create studio", "/theme`", "method: \"DELETE\"", "edit: true", "Change look", "Unpublish"]) assert.ok(create.includes(s), s);
  // A look change that was running when the page reloaded has no build to resume: it shows the app, not "the build never began".
  assert.match(create, /else if \(c\.appId && op && op\.type !== "edit"\) patch\.current\(\{ phase: "ready" \}\)/);
  // Follow-ups on an existing app show its look and live state, never a "Planning the product" spinner on a finished card.
  assert.ok(create.includes("data-app-status"), "status line on op cards");
  assert.ok(create.includes('if (spec || running) out.push({ key: "plan"'), "no plan spinner when nothing runs");
  assert.ok(create.includes("Put your latest changes to"), "publishing an already-live app says it updates the live version");
});

test("cards: design rules hold in the new card styles (no blue/purple, no focus boxes, no mono font)", () => {
  for (const f of ["src/components/app-ui/workspace/workspace.module.css", "src/components/app-ui/studio/studio.module.css", "src/components/app-ui/create/create.module.css"]) {
    const css = read(f);
    assert.ok(!/outline\s*:\s*(?!none)[^;]*solid/.test(css), `${f}: no focus outline`);
    assert.ok(!/:focus(-visible|-within)?\s*\{[^}]*outline\s*:\s*(?!none)/.test(css), `${f}: no focus outline box`);
    assert.ok(!/:focus(-visible|-within)?\s*\{[^}]*box-shadow\s*:\s*0 0 0 [2-9]px[^,;]*;/.test(css), `${f}: keyboard focus is a soft glow, not a hard ring`);
    if (!f.includes("/create/")) assert.ok(!/#(?:[0-9a-f]{3}){1,2}\b/i.test(css.replace(/#fff\b/gi, "")), `${f}: colors come from tokens`);
    assert.ok(!/\b(?:blue|purple|violet|indigo)\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: no blue or purple`);
  }
  assert.ok(!/--f-mono|monospace/.test(read("src/components/app-ui/workspace/workspace.module.css")));
});
