import "./setup";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signIn as realSignIn } from "./helpers/session";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { addItems } from "@/lib/memory/repo";
import { recordTurn } from "@/lib/memory/digest";
import { afterTurn } from "@/lib/memory/turn";
import { setExtractDeps } from "@/lib/memory/extract";
import { freeEndpointsMayTrain, liveEnv } from "@/lib/orchestration/config";
import { TRAINING_STATEMENT } from "@/lib/privacy/training-statement";
import { FREE_DOCS_NOT_SENT, FREE_PRIVACY_NOTE } from "@/lib/privacy/free-gate";
import { privacy } from "@/components/legal/content/privacy";

const NOTE = "The user is training for a marathon in April.";
const DOC = "CONFIDENTIAL-DOC-TEXT-7731 quarterly numbers";
const signed = new Map<string, ReturnType<typeof realSignIn>>();
const signIn = (email: string, plan: "free" | "plus" = "free") => { if (!signed.has(email)) signed.set(email, realSignIn(email, plan)); return signed.get(email)!; };
let ipn = 0;
const ip = () => `10.77.${(++ipn >> 8) & 255}.${ipn & 255}`;
const PROMPT = "Build me a weekly running plan for my marathon training schedule please";

afterEach(() => { delete process.env.KEPLAR_FREE_DATA_COLLECTION; setExtractDeps(undefined); });

async function withModels<T>(fn: (sent: string[]) => Promise<T>): Promise<T> {
  const sent: string[] = [];
  const real = globalThis.fetch;
  const env = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sent.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ error: { code: 500 } }), { status: 500 });
  }) as typeof fetch;
  try { return await fn(sent); } finally {
    globalThis.fetch = real;
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

async function ask(cookie: string, extra: Record<string, unknown> = {}, prompt = PROMPT) {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip(), cookie }, body: JSON.stringify({ prompt, history: [], chatId: `thr_${ipn}`, ...extra }) }));
  const text = await res.text();
  return Object.assign(res, { text });
}

async function seed(ws: string) {
  await addItems(ws, [{ text: NOTE, kind: "goal" }], "auto");
  await recordTurn({ chatId: "thr_old", workspaceId: ws, title: "Old", prompt: "marathon pacing question", answer: "Run easy.", at: Date.now() - 3600_000 });
}

test("Free requests default to endpoints that may train, and the gate keys off that", () => {
  assert.equal(freeEndpointsMayTrain({}), true);
  assert.equal(freeEndpointsMayTrain({ KEPLAR_FREE_DATA_COLLECTION: "deny" }), false);
  assert.equal(liveEnv("free").freeDataCollection, "allow");
});

test("Free: signed-in memory never reaches a model; the conversation does", async () => {
  const u = await signIn("fp-free@example.com", "free");
  await seed(u.workspaceId);
  await withModels(async (sent) => {
    await ask(u.cookie, { history: [{ role: "user", text: "I am planning a race" }, { role: "keplar", text: "Great, tell me more." }] });
    assert.ok(sent.length > 0, "models were called");
    assert.ok(sent.every((b) => !b.includes(NOTE) && !b.includes("KEPLAR_RECENT_CHATS") && !b.includes("KEPLAR_PAST_CHATS")), "no notes or past chats");
    assert.ok(sent.some((b) => b.includes("I am planning a race")), "the conversation still goes along");
  });
});

test("Free: attached documents are refused before anything is sent or counted", async () => {
  const u = await signIn("fp-docs@example.com", "free");
  await withModels(async (sent) => {
    const res = await ask(u.cookie, { docs: [{ name: "q.txt", text: DOC }] });
    assert.equal(res.status, 422);
    const j = JSON.parse(res.text) as { code?: string; error?: string };
    assert.equal(j.code, "docs_not_on_free");
    assert.equal(j.error, FREE_DOCS_NOT_SENT);
    assert.equal(sent.length, 0);
  });
});

test("Free with KEPLAR_FREE_DATA_COLLECTION=deny: memory and documents work again", async () => {
  process.env.KEPLAR_FREE_DATA_COLLECTION = "deny";
  const u = await signIn("fp-deny@example.com", "free");
  await seed(u.workspaceId);
  await withModels(async (sent) => {
    const res = await ask(u.cookie, { docs: [{ name: "q.txt", text: DOC }] });
    assert.notEqual(res.status, 422);
    assert.ok(sent.some((b) => b.includes(NOTE)), "notes allowed");
    assert.ok(sent.some((b) => b.includes("CONFIDENTIAL-DOC-TEXT-7731")), "documents allowed");
    assert.ok(sent.every((b) => !b.includes('"data_collection":"allow"')), "deny is what is sent");
  });
});

test("a paid plan keeps memory and documents", async () => {
  const u = await signIn("fp-plus@example.com", "plus");
  await seed(u.workspaceId);
  await withModels(async (sent) => {
    await ask(u.cookie, { docs: [{ name: "q.txt", text: DOC }] });
    assert.ok(sent.some((b) => b.includes(NOTE) && b.includes("CONFIDENTIAL-DOC-TEXT-7731")));
  });
});

test("learning: with modelsAllowed false no model writes a summary or extracts facts", async () => {
  const u = await signIn("fp-learn@example.com", "free");
  let calls = 0;
  setExtractDeps({ models: [], registry: { once: async () => { calls++; return { ok: true, text: "[]" }; } } } as never);
  await withModels(async (sent) => {
    const r = await afterTurn({ workspaceId: u.workspaceId, req: { prompt: "I live in Lisbon and I am a nurse and I love climbing", chatId: "thr_l1" }, answer: "That sounds great, here is a long answer about climbing near Lisbon. ".repeat(5), modelsAllowed: false });
    assert.equal(r.saved, 0);
    assert.equal(sent.length, 0);
    assert.equal(calls, 0);
  });
});

test("the privacy copy is honest about the Free gate", () => {
  assert.match(FREE_PRIVACY_NOTE, /Free/);
  assert.ok(JSON.stringify(TRAINING_STATEMENT).includes(FREE_PRIVACY_NOTE.slice(0, 40)));
  assert.match(JSON.stringify(privacy), /Free/);
});
