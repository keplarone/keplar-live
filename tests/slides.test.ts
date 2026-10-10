import "./setup";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signIn, call, jsonReq } from "./helpers/session";
import { DECK_JSON, fakeModels } from "./helpers/tool-models";
import { GET as listGET, POST as generatePOST } from "@/app/api/slides/decks/route";
import { GET as deckGET, PUT as deckPUT, DELETE as deckDELETE } from "@/app/api/slides/decks/[id]/route";
import { GET as exportGET } from "@/app/api/slides/decks/[id]/export/route";
import { POST as regenPOST } from "@/app/api/slides/decks/[id]/regenerate/route";
import { usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { parseDeck, normalizeSlide } from "@/lib/slides/engine";
import { sanitizeSlides } from "@/lib/slides/repo";
import { deckToPdf, deckToPptx, safeFileName } from "@/lib/slides/export";
import { canUseSlides, slidesLimitsFor } from "@/lib/tools/limits";
import { setToolDeps } from "@/lib/tools/run";
import { creditsForUsd } from "@/lib/tools/models";
import type { Deck } from "@/lib/slides/types";

after(() => setToolDeps(undefined));
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = { topic: "Solar power basics", count: 4, style: "clean", theme: "dark" };

test("slides access: only Plus and Pro (and Business); Free and signed-out are refused by the server", async () => {
  assert.equal(canUseSlides("free"), false);
  assert.ok(canUseSlides("plus") && canUseSlides("pro") && canUseSlides("business"));
  assert.equal(slidesLimitsFor("free"), null);

  const anon = await listGET(call(null, "/api/slides/decks"));
  assert.equal(anon.status, 401);
  assert.equal((await generatePOST(jsonReq(null, "/api/slides/decks", "POST", body))).status, 401);

  const free = await signIn("slides-free@example.com", "free");
  const m = fakeModels("free", () => DECK_JSON);
  try {
    for (const res of [await listGET(call(free.cookie, "/api/slides/decks")), await generatePOST(jsonReq(free.cookie, "/api/slides/decks", "POST", body))]) {
      assert.equal(res.status, 403);
      const j = await res.json();
      assert.equal(j.code, "plan_required");
      assert.equal(j.upgradeTo, "plus");
    }
    assert.equal(m.calls.length, 0, "no model is called for a Free account");
  } finally { m.restore(); }
});

test("slides generation: charged from the reported cost, saved, edited, exported, deleted", async () => {
  const plus = await signIn("slides-plus@example.com", "plus");
  const m = fakeModels("plus", () => DECK_JSON, 0.01);
  try {
    const before = await usedThisPeriod((await workspaceById(plus.workspaceId))!);
    const res = await generatePOST(jsonReq(plus.cookie, "/api/slides/decks", "POST", body));
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    const { deck, credits } = (await res.json()) as { deck: Deck; credits: number };
    assert.equal(deck.slides.length, 4);
    assert.equal(deck.slides[0].layout, "title");
    assert.equal(m.calls[0].model, "live:gemini-3.1-flash-lite", "Plus uses its first Plus model");
    assert.equal(credits, creditsForUsd(0.01));
    const after1 = await usedThisPeriod((await workspaceById(plus.workspaceId))!);
    assert.equal(after1 - before, credits);

    const list = await (await listGET(call(plus.cookie, "/api/slides/decks"))).json();
    assert.equal(list.decks.length, 1);

    // Another account can't read or delete it.
    const other = await signIn("slides-other@example.com", "plus");
    assert.equal((await deckGET(call(other.cookie, `/api/slides/decks/${deck.id}`), idCtx(deck.id))).status, 404);
    assert.equal((await deckDELETE(jsonReq(other.cookie, `/api/slides/decks/${deck.id}`, "DELETE"), idCtx(deck.id))).status, 404);

    // Editing is free and sanitised.
    const put = await deckPUT(jsonReq(plus.cookie, `/api/slides/decks/${deck.id}`, "PUT", { title: "Edited <b>", slides: [{ ...deck.slides[1], title: "New title", bullets: ["a", "b"] }] }), idCtx(deck.id));
    assert.equal(put.status, 200);
    const used2 = await usedThisPeriod((await workspaceById(plus.workspaceId))!);
    assert.equal(used2, after1, "editing costs nothing");

    // Exports are real files.
    const pptx = await exportGET(call(plus.cookie, `/api/slides/decks/${deck.id}/export?format=pptx`), idCtx(deck.id));
    assert.equal(pptx.status, 200);
    const zip = new Uint8Array(await pptx.arrayBuffer());
    assert.equal(String.fromCharCode(zip[0], zip[1]), "PK");
    const pdf = await exportGET(call(plus.cookie, `/api/slides/decks/${deck.id}/export?format=pdf`), idCtx(deck.id));
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");

    // Regenerating one slide is charged by its own cost.
    const m2 = fakeModels("plus", () => JSON.stringify({ title: "Fresh angle", bullets: ["One", "Two"], notes: "n" }), 0.004);
    const rg = await regenPOST(jsonReq(plus.cookie, `/api/slides/decks/${deck.id}/regenerate`, "POST", { index: 0, instruction: "Punchier" }), idCtx(deck.id));
    assert.equal(rg.status, 200, JSON.stringify(await rg.clone().json()));
    assert.equal((await usedThisPeriod((await workspaceById(plus.workspaceId))!)) - used2, creditsForUsd(0.004));
    m2.restore();

    assert.equal((await deckDELETE(jsonReq(plus.cookie, `/api/slides/decks/${deck.id}`, "DELETE"), idCtx(deck.id))).status, 200);
    assert.equal((await deckGET(call(plus.cookie, `/api/slides/decks/${deck.id}`), idCtx(deck.id))).status, 404);
  } finally { m.restore(); }
});

test("slides: a run with no response, or an unreadable reply, is not charged and saves nothing", async () => {
  const pro = await signIn("slides-pro@example.com", "pro");
  const ws = (await workspaceById(pro.workspaceId))!;
  const start = await usedThisPeriod(ws);
  let m = fakeModels("pro", () => null);
  try {
    const res = await generatePOST(jsonReq(pro.cookie, "/api/slides/decks", "POST", body));
    assert.equal(res.status, 502);
    assert.equal(await usedThisPeriod(ws), start, "no response → no charge");
  } finally { m.restore(); }
  m = fakeModels("pro", () => "I'm sorry, here is some prose and no JSON.", 0.02);
  try {
    const res = await generatePOST(jsonReq(pro.cookie, "/api/slides/decks", "POST", body));
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /not charged/i);
    assert.equal(await usedThisPeriod(ws), start, "unusable reply → no charge");
    assert.equal((await (await listGET(call(pro.cookie, "/api/slides/decks"))).json()).decks.length, 0);
  } finally { m.restore(); }
});

test("slides: validation and 'models not set up' are honest", async () => {
  const plus = await signIn("slides-val@example.com", "plus");
  assert.equal((await generatePOST(jsonReq(plus.cookie, "/api/slides/decks", "POST", { topic: "a" }))).status, 400);
  setToolDeps(undefined);
  const res = await generatePOST(jsonReq(plus.cookie, "/api/slides/decks", "POST", body));
  assert.equal(res.status, 503, "no keys in tests → not configured, nothing faked");
});

test("slides parsing and sanitising: tolerant of fences, strict on shape and length", () => {
  const d = parseDeck("```json\n" + DECK_JSON + "\n```", 3)!;
  assert.equal(d.slides.length, 3);
  assert.equal(parseDeck("nothing", 5), null);
  assert.equal(normalizeSlide({ layout: "weird", title: "", bullets: [] }), null);
  const s = normalizeSlide({ title: "T".repeat(500), bullets: Array.from({ length: 20 }, (_, i) => `- point ${i}`) })!;
  assert.ok(s.title.length <= 120 && s.bullets.length <= 8 && !s.bullets[0].startsWith("-"));
  assert.equal(sanitizeSlides("nope", 10), null);
  assert.equal(sanitizeSlides([{ title: "ok", bullets: ["x"] }], 10)!.length, 1);
});

test("slides export: placeholders for images (no real image claims), safe file names, valid files", async () => {
  const deck = { id: "d", workspaceId: "w", title: "Q3 «review»: plan/2026", topic: "t", style: "clean", theme: "light", createdAt: "", updatedAt: "", credits: 0, slides: parseDeck(DECK_JSON, 4)!.slides } as Deck;
  assert.equal(safeFileName(deck.title), "Q3-review-plan-2026");
  const pptx = await deckToPptx(deck);
  assert.equal(pptx.subarray(0, 2).toString(), "PK");
  assert.ok(pptx.length > 5000);
  const pdf = await deckToPdf(deck);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
});
