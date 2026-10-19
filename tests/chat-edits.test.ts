import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState, reducer } from "@/components/app-ui/state/store";
import type { Project, Thread } from "@/components/app-ui/state/types";
import { checkProjectName, deleteProject, mergeProjects, renameProject, type Ops } from "@/components/app-ui/workspace/project-ops";
import { chatAct, isAgentAct, projectAct, routeChat, slideHandEdit, studyFollowUp } from "@/lib/chat-actions/intent";
import { examDateFrom } from "@/lib/study/exam-date";
import { colorPatch, currentColors, domainGate, FONT_CHOICES, hostFrom, STYLE_COLORS } from "@/components/app-ui/create/look-edit";
import { buildCron, cronFromWords, formFromCron, timeFrom } from "@/lib/business/cron-form";
import { approveBody, CAP_MAX, capsPatch, editableDraft, filterOrders, historyHits, orderSummary, type OrderRow } from "@/components/app-ui/workspace/workspace-data";
import type { OutboundAction } from "@/lib/business/types";
import { bulletsFromText, editSlide, moveSlide, removeSlide, withSlideText } from "@/lib/slides/deck-edit";
import { FIELD_MAX, type Slide } from "@/lib/slides/types";
import { cardHistoryLine } from "@/components/app-ui/state/cards";
import type { KeplarMessage } from "@/components/app-ui/state/types";

/** Closing the parity gaps: edits that used to need a tab, done from chat cards (projects, history, ...). */
const read = (f: string) => readFileSync(f, "utf8");
const r = (t: string) => routeChat(t, {})?.intent ?? null;
const proj = (id: string, name: string): Project => ({ id, name, createdAt: 1 });
const th = (id: string, projectId: string | null): Thread => ({ id, title: id, projectId, createdAt: 1, updatedAt: 1, messages: [] });

function fakeOps(signedIn: boolean, notes: string[] = [], fail?: (url: string, method: string) => number | null) {
  const calls: string[] = [];
  const actions: unknown[] = [];
  const ops: Ops = {
    signedIn,
    dispatch: (a) => actions.push(a),
    fetch: async (url, init) => {
      calls.push(`${init.method} ${url}${init.body ? " " + init.body : ""}`);
      const status = fail?.(url, init.method) ?? 200;
      return { ok: status < 400, status, json: async () => (status >= 400 ? { error: "Nope." } : init.method === "GET" ? { notes: notes.map((text, i) => ({ id: `n${i}`, text })) } : {}) };
    },
  };
  return { ops, calls, actions };
}

test("edits: project and chat housekeeping is asked for in words or slash commands", () => {
  assert.deepEqual(r("rename project Taxes to Taxes 2026"), { type: "workspace", card: "projects", act: { type: "rename-project", name: "Taxes", to: "Taxes 2026" } });
  assert.deepEqual(r("rename my Taxes project to Money"), { type: "workspace", card: "projects", act: { type: "rename-project", name: "Taxes", to: "Money" } });
  assert.deepEqual(r("delete the Taxes project"), { type: "workspace", card: "projects", act: { type: "delete-project", name: "Taxes" } });
  assert.deepEqual(r("merge my Taxes project with Finance"), { type: "workspace", card: "projects", act: { type: "merge-projects", name: "Taxes", into: "Finance" } });
  assert.deepEqual(r("/projects merge A into B"), { type: "workspace", card: "projects", act: { type: "merge-projects", name: "A", into: "B" } });
  assert.deepEqual(r("/projects delete Old"), { type: "workspace", card: "projects", act: { type: "delete-project", name: "Old" } });
  assert.deepEqual(r("rename this chat to Coffee deck"), { type: "workspace", card: "history", act: { type: "rename-chat", to: "Coffee deck" } });
  assert.deepEqual(r("delete this chat"), { type: "workspace", card: "history", act: { type: "delete-chat" } });
  assert.deepEqual(r("delete my chat about sourdough"), { type: "workspace", card: "history", act: { type: "delete-chat", query: "sourdough" }, query: "sourdough" });
  assert.deepEqual(r("/history delete"), { type: "workspace", card: "history", act: { type: "delete-chat" } });
  // not hijacked
  assert.equal(r("merge these two lists"), null);
  assert.equal(projectAct("merge the two paragraphs into one"), null, "a merge without 'project' is not a project merge");
  assert.equal(chatAct("delete the last line"), null);
  assert.equal(isAgentAct({ type: "delete-project", name: "x" }), false);
  assert.equal(isAgentAct({ type: "pause", name: "x" }), true);
});

test("edits: project names must be new and non-empty", () => {
  const ps = [proj("p1", "Taxes"), proj("p2", "Finance")];
  assert.deepEqual(checkProjectName(ps, "p1", "  finance "), { ok: false, text: "A project called “finance” already exists." });
  assert.deepEqual(checkProjectName(ps, "p1", "taxes"), { ok: true, name: "taxes" }, "renaming to a new case of its own name is fine");
  assert.equal(checkProjectName(ps, null, "   ").ok, false);
});

test("edits: rename, delete and merge use the Projects routes and the same reducer actions", async () => {
  const ps = [proj("p1", "Taxes"), proj("p2", "Finance")];
  const ts = [th("c1", "p1"), th("c2", "p1"), th("c3", "p2")];
  let f = fakeOps(true);
  assert.deepEqual(await renameProject(f.ops, ps, "p1", "Taxes 2026"), { ok: true, text: "Renamed “Taxes” to “Taxes 2026”." });
  assert.deepEqual(f.calls, ['PATCH /api/projects/p1 {"name":"Taxes 2026"}']);
  assert.deepEqual(f.actions, [{ type: "rename-project", id: "p1", name: "Taxes 2026" }]);

  f = fakeOps(true);
  const d = await deleteProject(f.ops, ps, ts, "p1", "keep");
  assert.equal(d.ok, true);
  assert.match(d.text, /2 chats are kept/);
  assert.deepEqual(f.calls, ['DELETE /api/projects/p1 {"confirm":"DELETE","chats":"keep"}'], "the server's own DELETE confirm word");

  f = fakeOps(true, ["Use the 2025 numbers"]);
  const mg = await mergeProjects(f.ops, ps, ts, "p1", "p2");
  assert.deepEqual(mg, { ok: true, text: "Merged “Taxes” into “Finance”: 2 chats and 1 note moved." });
  assert.deepEqual(f.calls, [
    "GET /api/projects/p1",
    'POST /api/projects/p2/memory {"text":"Use the 2025 numbers"}',
    'PATCH /api/chats/c1 {"projectId":"p2"}',
    'PATCH /api/chats/c2 {"projectId":"p2"}',
    'DELETE /api/projects/p1 {"confirm":"DELETE","chats":"keep"}',
  ], "notes and chats move before the source is deleted, so nothing is detached");
  assert.deepEqual(f.actions.at(-1), { type: "remove-project", id: "p1", chats: "keep" });
  assert.equal((await mergeProjects(f.ops, ps, ts, "p1", "p1")).ok, false);

  // signed out: local only; a browser-only project (404 on the server) still changes locally; a real error stops everything
  f = fakeOps(false);
  assert.equal((await deleteProject(f.ops, ps, ts, "p2", "delete")).ok, true);
  assert.deepEqual(f.calls, []);
  f = fakeOps(true, [], () => 404);
  assert.equal((await renameProject(f.ops, ps, "p1", "X")).ok, true);
  f = fakeOps(true, [], (_u, m) => (m === "DELETE" ? 500 : null));
  const bad = await mergeProjects(f.ops, ps, ts, "p1", "p2");
  assert.deepEqual(bad, { ok: false, text: "Nope." });
  assert.ok(!f.actions.some((a) => (a as { type: string }).type === "remove-project"), "a failed delete leaves the project");
});

test("edits: the reducer renames a project in place", () => {
  let st = { ...initialState(), projects: [proj("p1", "Taxes")] };
  st = reducer(st, { type: "rename-project", id: "p1", name: "Money" });
  assert.deepEqual(st.projects, [proj("p1", "Money")]);
});

test("edits: destructive actions in the Projects and History cards wait for a confirm click", () => {
  const src = read("src/components/app-ui/workspace/WorkspaceTurn.tsx");
  for (const label of ['yes="Delete project"', 'yes="Merge"', 'yes="Delete chat"']) assert.ok(src.includes(label), label);
  assert.ok(src.includes("Uploaded files are not moved."), "merge says what does not move");
  assert.ok(!src.includes("Rename and delete chats in History."), "History no longer sends you to the tab for this");
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.ok(app.includes("onDeleteThread={deleteChat}") && app.includes("requestDelete(id);"), "deleting a chat from a card uses the app's undo window (after stopping its answer)");
});

const slide = (id: string, title = id): Slide => ({ id, layout: "content", title, section: "", bullets: ["a", "b"], notes: "n", imagePrompt: "" });
const deck5 = () => ["s1", "s2", "s3", "s4", "s5"].map((id) => slide(id));

test("edits: hand-editing a slide keeps the server's limits", () => {
  assert.deepEqual(bulletsFromText("- one\n\n2) two\n  • three  \n"), ["one", "two", "three"]);
  assert.equal(bulletsFromText(Array.from({ length: 12 }, (_, i) => `b${i}`).join("\n")).length, FIELD_MAX.bullets);
  assert.equal(bulletsFromText("x".repeat(500))[0].length, FIELD_MAX.bullet);
  const e = editSlide(slide("s1"), { title: "  New   title ", bullets: "x\ny", notes: "Line one\n\n\n\nLine two" });
  assert.deepEqual(e, { ...slide("s1"), title: "New title", bullets: ["x", "y"], notes: "Line one\n\nLine two" });
  assert.equal(editSlide(slide("s1"), { title: " ", bullets: "\n", notes: "" }), null, "a slide needs a title or a bullet");
  const d = deck5();
  assert.equal(withSlideText(d, 1, { title: "s2", bullets: "a\nb", notes: "n" }).slides, d, "no change, no save");
  assert.equal(withSlideText(d, 1, { title: "", bullets: "", notes: "" }).error, "A slide needs a title or at least one bullet.");
  assert.equal(withSlideText(d, 1, { title: "Two", bullets: "a", notes: "" }).slides[1].title, "Two");
  assert.equal(withSlideText(d, 9, { title: "x", bullets: "", notes: "" }).error, "That slide is not in the deck any more.");
});

test("edits: moving and deleting slides", () => {
  const ids = (x: Slide[] | null) => x?.map((s) => s.id).join(",");
  assert.equal(ids(moveSlide(deck5(), 3, 1)), "s1,s4,s2,s3,s5");
  assert.equal(ids(moveSlide(deck5(), 0, 4)), "s2,s3,s4,s5,s1");
  assert.equal(ids(moveSlide(deck5(), 2, 99)), "s1,s2,s4,s5,s3", "clamped to the end");
  const d = deck5();
  assert.equal(moveSlide(d, 2, 2), d);
  assert.equal(ids(removeSlide(deck5(), 4)), "s1,s2,s3,s4");
  assert.equal(removeSlide([slide("only")], 0), null, "a deck keeps at least one slide");
  assert.equal(removeSlide(deck5(), 7), null);
});

test("edits: 'move slide 4 to 2' and 'delete slide 5' act on the deck on the last card", () => {
  const last = { kind: "slides", deckId: "dk", count: 8 } as const;
  const rl = (t: string) => routeChat(t, { last })?.intent ?? null;
  assert.deepEqual(rl("move slide 4 to 2"), { type: "slides.move", deckId: "dk", from: 3, to: 1 });
  assert.deepEqual(rl("Move the last slide up."), { type: "slides.move", deckId: "dk", from: 7, to: 6 });
  assert.deepEqual(rl("move slide 3 to the end"), { type: "slides.move", deckId: "dk", from: 2, to: 7 });
  assert.deepEqual(rl("put slide 5 before slide 2"), { type: "slides.move", deckId: "dk", from: 4, to: 1 });
  assert.deepEqual(rl("move slide 2 after slide 5"), { type: "slides.move", deckId: "dk", from: 1, to: 4 });
  assert.deepEqual(rl("delete slide 5"), { type: "slides.delete", deckId: "dk", index: 4 });
  assert.deepEqual(rl("drop the third slide"), { type: "slides.delete", deckId: "dk", index: 2 });
  assert.equal(rl("move slide 1 up"), null, "already first");
  assert.equal(slideHandEdit("delete slide 9", 8), null, "not in the deck");
  assert.equal(rl("remove the chart from slide 3")?.type, "slides.edit", "a rewrite stays a rewrite");
  assert.equal(routeChat("delete slide 5", {})?.intent ?? null, null, "no deck, no hand edit");
});

test("edits: deleting a slide from words waits for the confirm in the card, and the history says what happened", () => {
  const src = read("src/components/app-ui/studio/StudioTurn.tsx");
  assert.ok(/pendingDelete[\s\S]{0,400}<Confirm[^>]*yes="Delete slide"/.test(src), "the delete op shows a confirm, not a delete");
  assert.ok(src.includes('setConfirmDel(sel)'), "the Delete slide button asks first");
  assert.ok(!/op\.type === "delete"[^\n]*method: "PUT"/.test(src));
  const km = (studio: KeplarMessage["studio"]): KeplarMessage => ({ id: "k", role: "keplar", replyTo: "u", status: "done", stages: [], capabilities: [], models: [], draft: "", startedAt: 1, finishedAt: 2, studio });
  assert.equal(cardHistoryLine(km({ kind: "slides", phase: "ready", id: "dk", title: "Jazz", op: { type: "delete", index: 4 }, opDone: "done" })), '[Keplar deleted slide 5 from the deck "Jazz"]');
  assert.match(cardHistoryLine(km({ kind: "slides", phase: "ready", id: "dk", title: "Jazz", op: { type: "delete", index: 4 } })) ?? "", /not deleted/);
  assert.equal(cardHistoryLine(km({ kind: "slides", phase: "ready", id: "dk", title: "Jazz", op: { type: "move", from: 3, to: 1 } })), '[Keplar moved slide 4 to position 2 in the deck "Jazz"]');
});

test("edits: an exam date from words is a day from today on (US month/day)", () => {
  const T = "2026-10-06"; // a Tuesday
  const cases: [string, string | null][] = [
    ["Nov 3", "2026-11-03"], ["November 3rd", "2026-11-03"], ["the 3rd of November", "2026-11-03"], ["3 November 2026", "2026-11-03"],
    ["11/3", "2026-11-03"], ["11/3/27", "2027-11-03"], ["2026-11-03", "2026-11-03"], ["tomorrow", "2026-10-07"], ["in 3 weeks", "2026-10-27"],
    ["in a week", "2026-10-13"], ["Friday", "2026-10-09"], ["Tuesday", "2026-10-13"], ["Jan 5", "2027-01-05"], ["in 2 months", "2026-12-06"],
    ["Feb 30", null], ["2025-01-01", null], ["sometime soon", null], ["Mon 5", null], ["2040-01-01", null],
  ];
  for (const [t, want] of cases) assert.equal(examDateFrom(t, T), want, t);
});

test("edits: Study follow-ups set the exam date, open the plan and the placement quiz", () => {
  const T = "2026-10-06";
  const last = { kind: "study", setId: "ss" } as const;
  const rl = (t: string) => routeChat(t, { last, today: T })?.intent ?? null;
  assert.deepEqual(rl("my exam is on Nov 3"), { type: "study.again", setId: "ss", focus: "plan", examDate: "2026-11-03" });
  assert.deepEqual(rl("Set my exam date to 2026-11-03."), { type: "study.again", setId: "ss", focus: "plan", examDate: "2026-11-03" });
  assert.deepEqual(rl("clear my exam date"), { type: "study.again", setId: "ss", focus: "plan", examDate: "" });
  assert.deepEqual(rl("my exam is sometime soon"), { type: "study.again", setId: "ss", focus: "plan" }, "unclear date: open the plan to pick it");
  assert.deepEqual(rl("show my study plan"), { type: "study.again", setId: "ss", focus: "plan" });
  assert.deepEqual(rl("take the placement quiz"), { type: "study.again", setId: "ss", focus: "placement" });
  assert.deepEqual(rl("/study exam Nov 3")?.type, "study.again");
  assert.deepEqual(rl("/study placement"), { type: "study.again", setId: "ss", focus: "placement" });
  assert.equal(rl("what is the plan"), null, "a general question stays a question");
  assert.equal(studyFollowUp("quiz me", T), null);
  assert.equal(routeChat("my exam is on Nov 3", { today: T }), null, "no study set, no exam date");
});

test("edits: the Study card's placement quiz and exam date use the Study tab's calls", () => {
  const src = read("src/components/app-ui/studio/StudioTurn.tsx");
  assert.ok(src.includes('finish: { kind: "diagnostic" }'), "the last placement answer finishes the diagnostic");
  assert.ok(src.includes("/progress`") && src.includes("ids: qs.map((x) => x.id)"), "and records it like the tab");
  assert.ok(src.includes('method: "PATCH"') && src.includes("examDate: date || null"), "exam date: PATCH, empty clears");
  assert.ok(src.includes("started.has(`${m.id}:exam`)") && src.includes("st.opDone"), "an exam date from words is saved once, not on every reload");
  const km = (studio: KeplarMessage["studio"]): KeplarMessage => ({ id: "k", role: "keplar", replyTo: "u", status: "done", stages: [], capabilities: [], models: [], draft: "", startedAt: 1, finishedAt: 2, studio });
  assert.match(cardHistoryLine(km({ kind: "study", phase: "ready", id: "ss", standalone: true, focus: "plan", examDate: "2026-11-03", opDone: "done" })) ?? "", /exam date to 2026-11-03/);
  assert.match(cardHistoryLine(km({ kind: "study", phase: "ready", id: "ss", standalone: true, focus: "placement" })) ?? "", /placement quiz/);
});

test("edits: a pending email or post is edited before approval; the edit rides on the same approve call", () => {
  const email: OutboundAction = { type: "email.send", connector: "gmail", to: "ana@x.com", subject: "Hi", body: "Draft body" };
  const slack: OutboundAction = { type: "slack.post", connector: "slack", channel: "#ops", text: "Draft post" };
  const cal: OutboundAction = { type: "gcal.event", connector: "gcal", title: "Call", description: "", start: "s", end: "e" };
  assert.deepEqual(editableDraft(email), { key: "body", value: "Draft body", max: 10000, label: "Email" });
  assert.equal(editableDraft(slack)?.key, "text");
  assert.equal(editableDraft(cal), null, "calendar events are approved as drafted");
  assert.deepEqual(approveBody(email, "New body"), { decision: "approve", edits: { body: "New body" } });
  assert.deepEqual(approveBody(slack, "  New post "), { decision: "approve", edits: { text: "New post" } });
  assert.deepEqual(approveBody(email, "Draft body "), { decision: "approve" }, "unchanged: plain approve");
  assert.deepEqual(approveBody(email, "   "), { decision: "approve" }, "an emptied draft is never sent as empty");
  assert.deepEqual(approveBody(email, null), { decision: "approve" });
  assert.equal(approveBody(email, "x".repeat(20000)).edits?.body?.length, 10000);
  const src = read("src/components/app-ui/workspace/WorkspaceTurn.tsx");
  assert.ok(src.includes("approveBody(a.action, edited)") && src.includes("data-edit-draft"), "the Approvals card has Edit and sends the edit");
  assert.ok(!src.includes("To edit a draft first, open it in Approvals."));
});

test("edits: orders have their own card ('show my orders', /orders), separate from the dashboard", () => {
  for (const t of ["show my orders", "my recent orders", "did I get any new orders?", "/orders"]) assert.deepEqual(r(t), { type: "workspace", card: "orders" }, t);
  assert.deepEqual(r("show my revenue"), { type: "workspace", card: "dashboard" });
  assert.equal(r("who bought Twitter"), null, "a question stays a question");
  assert.deepEqual(r("how's my business doing"), { type: "workspace", card: "dashboard" });
  const o = (id: string, status: OrderRow["status"], amount: number, refundedAmount?: number, currency = "usd"): OrderRow => ({ id, productName: id, amount, currency, status, customerEmail: null, createdAt: "2026-10-01T00:00:00Z", ...(refundedAmount ? { refundedAmount } : {}) });
  const list = [o("a", "paid", 5000), o("b", "paid", 3000, 1000), o("c", "pending", 2000), o("d", "refunded", 4000, 4000), o("e", "paid", 9900, 0, "eur")];
  const sum = orderSummary(list);
  assert.deepEqual(sum.counts, { all: 5, paid: 3, pending: 1, refunded: 2 });
  assert.equal(sum.currency, "usd");
  assert.equal(sum.net, 7000, "paid minus partial refunds, in the main currency");
  assert.deepEqual(filterOrders(list, "refunded").map((x) => x.id), ["b", "d"]);
  assert.deepEqual(filterOrders(list, "pending").map((x) => x.id), ["c"]);
  assert.equal(orderSummary([]).net, 0);
});

test("edits: agent schedules from the preset form and from words build the same cron", () => {
  assert.equal(buildCron("weekdays", "09:30", "1", "6", ""), "30 9 * * 1-5");
  for (const cron of ["0 8 * * *", "30 9 * * 1-5", "15 10 * * 1", "0 */6 * * *"]) {
    const f = formFromCron(cron);
    assert.notEqual(f.mode, "custom", cron);
    assert.equal(buildCron(f.mode, f.time, f.dow, f.every, f.custom), cron, "editing starts from what is saved");
  }
  assert.equal(formFromCron("0 8 1 * *").mode, "custom");
  assert.deepEqual(timeFrom("8:30 pm"), [20, 30]);
  assert.deepEqual(timeFrom("12am"), [0, 0]);
  assert.deepEqual(timeFrom("noon"), [12, 0]);
  assert.equal(timeFrom("25:00"), null);
  const words: [string, string | null][] = [
    ["every day at 8am", "0 8 * * *"], ["daily at 18:00", "0 18 * * *"], ["every weekday at 9:30am", "30 9 * * 1-5"], ["every Monday at 10", "0 10 * * 1"],
    ["every Fridays at 4pm", "0 16 * * 5"], ["every 6 hours", "0 */6 * * *"], ["hourly", "0 * * * *"], ["every day", "0 8 * * *"], ["every blue moon", null], ["every day at 25", null],
  ];
  for (const [t, want] of words) assert.equal(cronFromWords(t), want, t);
});

test("edits: 'run my daily brief every weekday at 9am' reschedules that agent", () => {
  assert.deepEqual(r("run my daily brief every weekday at 9am"), { type: "workspace", card: "agents", act: { type: "schedule", name: "daily brief", cron: "0 9 * * 1-5", words: "every weekday at 9am" } });
  assert.equal((r("schedule the weekly report agent for Fridays at 4pm") as { act?: { cron?: string } })?.act?.cron, "0 16 * * 5");
  assert.equal((r("change my lead follow-up agent to every Monday at 10") as { act?: { name?: string } })?.act?.name, "lead follow-up");
  assert.deepEqual(r("run my daily brief agent now"), { type: "workspace", card: "agents", act: { type: "run", name: "daily brief" } }, "run now is still run now");
  assert.notEqual(r("make my app every day")?.type, "workspace", "not an agent without the word");
  assert.equal(isAgentAct({ type: "schedule", name: "x", cron: "0 8 * * *", words: "" }), true);
});

test("edits: agent caps in the chat card stay numbers within bounds, and stopping an agent waits for a confirm", () => {
  const cur = { runsPerDay: 24, outboundPerDay: 20, spendUsdPerMonth: 3 };
  assert.equal(capsPatch(cur, { runsPerDay: "24", outboundPerDay: "20", spendUsdPerMonth: "3" }), null, "nothing changed");
  assert.deepEqual(capsPatch(cur, { runsPerDay: "4", outboundPerDay: "20", spendUsdPerMonth: "1.255" }), { runsPerDay: 4, spendUsdPerMonth: 1.25 });
  assert.deepEqual(capsPatch(cur, { runsPerDay: "9999", outboundPerDay: "", spendUsdPerMonth: "3" }), { runsPerDay: CAP_MAX.runsPerDay });
  assert.equal(capsPatch(cur, { runsPerDay: "-1", outboundPerDay: "20", spendUsdPerMonth: "3" }), null);
  const src = read("src/components/app-ui/workspace/WorkspaceTurn.tsx");
  assert.ok(/confirmStop[\s\S]{0,80}<Confirm[^>]*yes="Stop for good"/.test(src), "stop for good asks first");
  assert.ok(!/autoSend:\s*(?:true|!)/.test(src), "the chat never turns auto-send on: outbound stays behind your approval");
  assert.ok(src.includes("{ schedule: { cron: act.cron, tz } }"), "a schedule from words keeps the agent's time zone");
});

test("edits: the Create card's mini picker offers every font pairing and color changes the theme route accepts", () => {
  assert.ok(FONT_CHOICES.length >= 10 && FONT_CHOICES.some((f) => f.id === "fraunces-hanken" && f.label === "Fraunces"));
  const cur = currentColors({ style: "editorial", mode: "light" });
  assert.match(cur.bg, /^#[0-9a-f]{6}$/);
  assert.equal(colorPatch({ style: "editorial", mode: "light" }, cur.bg, cur.accent), null, "unchanged colors: nothing to save");
  assert.deepEqual(colorPatch({}, "#101010", "#FF5500"), { palette: { bg: "#101010", accent: "#ff5500" }, paletteSource: "picked" });
  assert.equal(colorPatch({}, "red", "#ff5500"), null);
  assert.deepEqual(currentColors({ palette: { bg: "#101010", accent: "#ff5500" }, paletteSource: "picked" }), { bg: "#101010", accent: "#ff5500" });
  assert.deepEqual(STYLE_COLORS, { palette: null, paletteSource: "style" });
});

test("edits: domains are connected from the chat with the studio's gates, and removed only after a confirm", () => {
  const L = (o: Partial<Parameters<typeof domainGate>[0]>) => ({ domains: [], limit: 1, used: 0, plan: "plus", configured: true, published: true, ...o });
  assert.equal(domainGate(L({ limit: 0, plan: "free" })), "free");
  assert.equal(domainGate(L({ configured: false })), "unconfigured");
  assert.equal(domainGate(L({ published: false })), "unpublished");
  assert.equal(domainGate(L({ used: 1 })), "full");
  assert.equal(domainGate(L({})), "open");
  assert.equal(hostFrom(" https://www.BikeFix.com/shop?x=1 "), "www.bikefix.com");
  assert.equal(hostFrom("BikeFix.com.:443"), "bikefix.com", "port and trailing dot dropped");
  const last = { kind: "create", appId: "sit_1", name: "BikeFix" } as const;
  const rl = (t: string) => routeChat(t, { last })?.intent ?? null;
  assert.deepEqual(r("connect bikefix.com to my BikeFix app"), { type: "create.domain", appName: "BikeFix", hostname: "bikefix.com" });
  assert.deepEqual(r("add a custom domain to my BikeFix app"), { type: "create.domain", appName: "BikeFix" });
  assert.deepEqual(rl("connect bikefix.com"), { type: "create.domain", appId: "sit_1", hostname: "bikefix.com" });
  assert.deepEqual(rl("/domains shop.bikefix.com"), { type: "create.domain", appId: "sit_1", hostname: "shop.bikefix.com" });
  assert.equal(rl("add a contact form to my BikeFix app")?.type, "create.edit", "features stay edits");
  assert.equal(rl("what is bikefix.com"), null);
  const panel = read("src/components/app-ui/create/DomainsPanel.tsx");
  assert.ok(/removing\?\.id === d\.id[\s\S]{0,60}<Confirm[^>]*yes="Remove domain"/.test(panel), "remove asks first");
  assert.ok(!panel.includes("window.confirm"));
  assert.ok(/onSubmit=\{\(e\) => \{ e\.preventDefault\(\); if \(hostFrom\(input\)/.test(panel) && !/useEffect\([^)]*add\(/.test(panel), "a domain from words is prefilled, never added without the click");
  const turn = read("src/components/app-ui/create/CreateTurn.tsx");
  assert.ok(turn.includes("<CodeView") && turn.includes("FONT_CHOICES.map") && turn.includes("data-apply-colors"), "code view, fonts and colors in the card");
});

test("history hits: remote chats count, the card's own request never matches, titles win when finding one chat", () => {
  const base = { projectId: null, createdAt: 1 } as const;
  const here = { ...base, id: "here", title: "Coffee roasting", updatedAt: 9, messages: [{ id: "u1", role: "user", text: "delete my chat about sourdough" }, { id: "k1", role: "keplar", status: "done" }] };
  const remote = { ...base, id: "c_sour", title: "Sourdough starter tips", updatedAt: 5, messages: [], remote: true };
  const bread = { ...base, id: "bread", title: "Bread", updatedAt: 7, messages: [{ id: "u2", role: "user", text: "my sourdough is flat" }] };
  const empty = { ...base, id: "blank", title: "New chat", updatedAt: 8, messages: [] };
  const threads = [here, remote, bread, empty] as unknown as Thread[];
  assert.deepEqual(historyHits(threads, "").map((t) => t.id), ["here", "bread", "c_sour"]);
  assert.deepEqual(historyHits(threads, "sourdough").map((t) => t.id), ["here", "bread", "c_sour"]);
  assert.deepEqual(historyHits(threads, "sourdough", { skip: new Set(["u1", "k1"]) }).map((t) => t.id), ["bread", "c_sour"]);
  assert.deepEqual(historyHits(threads, "sourdough", { skip: new Set(["u1", "k1"]), preferTitles: true }).map((t) => t.id), ["c_sour"]);
  assert.deepEqual(historyHits(threads, "flat", { preferTitles: true }).map((t) => t.id), ["bread"]);
});
