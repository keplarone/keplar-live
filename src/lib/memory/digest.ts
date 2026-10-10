/**
 * Saved-chat digests: one small row per conversation, per user, written after each answered turn while
 * signed in with memory on. A digest holds a short summary (a free model writes it; an extractive fallback
 * is stored first so there is always one), the recent question/answer pairs trimmed to a few hundred
 * characters, and the title. It powers three things, none of which cost credits:
 *   - the compact "your last few chats" block given to a new chat,
 *   - retrieval of relevant past-chat snippets (Postgres full-text search in production),
 *   - deterministic recall answers ("what did we talk about last time / yesterday").
 * Rows are scoped by workspace, deleted with the chat, and erased with the user's memory.
 */
import { collection } from "@/lib/create/platform/store";
import { ensureSchema, neonConfigured, neonQuery, parseData } from "@/lib/create/platform/neon";
import { fence, INJECTION_RULES } from "@/lib/documents/guard";
import { cleanSmallTalk } from "@/lib/orchestration/smalltalk";
import { memoryModelDeps } from "./extract";
import { flat } from "./context";
import { looksLikeInjection, looksUnsafe, words } from "./facts";
import type { Classification } from "@/lib/orchestration/types";

export type LogEntry = { q: string; a: string; at: number };
export type ChatDigest = {
  id: string; // the chat's id
  workspaceId: string;
  title: string;
  summary: string;
  summarySource: "model" | "extract";
  /** Searchable text: the recent turns, flattened. */
  text: string;
  log: LogEntry[];
  /** Answered turns seen so far (the log keeps only the latest ones). */
  turns: number;
  createdAt: number;
  updatedAt: number;
};

export const MAX_DIGESTS = 200;
const MAX_LOG = 24;
const Q_MAX = 400;
const A_MAX = 500;
const TEXT_MAX = 9000;
const COLLECTION = "chat_digests";

export const digests = () => collection<ChatDigest>(COLLECTION);
export const validChatId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(id);

/* ───────────────────────────── building a digest ───────────────────────────── */

const textOf = (log: LogEntry[]) => {
  let out = "";
  for (let i = log.length - 1; i >= 0; i--) {
    const piece = `Q: ${log[i].q}${log[i].a ? ` A: ${log[i].a}` : ""}\n`;
    if (out.length + piece.length > TEXT_MAX) break;
    out = piece + out;
  }
  return out.trim();
};

/** Deterministic summary used until (or unless) a model writes a better one. */
export function extractiveSummary(log: LogEntry[], turns = log.length): string {
  if (!log.length) return "";
  const first = flat(log[0].q, 110);
  if (turns <= 1) return `Asked: "${first}"`;
  const last = flat(log[log.length - 1].q, 90);
  return `Started with "${first}", then ${turns - 1} follow-up${turns === 2 ? "" : "s"} (latest: "${last}")`;
}

export type TurnInput = { chatId: string; workspaceId: string; title?: string; prompt: string; answer: string; /** Attachments or images were part of the message: keep only the question. */ restricted?: boolean; at?: number };

/** Add this answered turn to the chat's digest (created on first use). Returns the stored digest. */
export async function recordTurn(t: TurnInput): Promise<ChatDigest> {
  const at = t.at ?? Date.now();
  const entry: LogEntry = { q: flat(t.prompt, Q_MAX), a: t.restricted ? "" : flat(t.answer, A_MAX), at };
  const cur = await digests().get(t.workspaceId, t.chatId);
  if (cur) {
    const log = [...cur.log, entry].slice(-MAX_LOG);
    const turns = (cur.turns || cur.log.length) + 1;
    const next: Partial<ChatDigest> = {
      log,
      text: textOf(log),
      turns,
      updatedAt: at,
      ...(t.title ? { title: flat(t.title, 120) } : {}),
      // The previous summary stays until the model refreshes it; the extractive one is only a stand-in.
      ...(cur.summarySource === "extract" ? { summary: extractiveSummary(log, turns) } : {}),
    };
    return (await digests().update(t.workspaceId, t.chatId, next)) ?? { ...cur, ...next } as ChatDigest;
  }
  await pruneOldest(t.workspaceId);
  const log = [entry];
  const row: ChatDigest = {
    id: t.chatId, workspaceId: t.workspaceId, title: flat(t.title || t.prompt, 120) || "New thread",
    summary: extractiveSummary(log, 1), summarySource: "extract", text: textOf(log), log, turns: 1, createdAt: at, updatedAt: at,
  };
  await digests().insert(row);
  return row;
}

export async function setSummary(workspaceId: string, chatId: string, summary: string): Promise<boolean> {
  return Boolean(await digests().update(workspaceId, chatId, { summary, summarySource: "model" }));
}

export async function renameDigest(workspaceId: string, chatId: string, title: string) {
  await digests().update(workspaceId, chatId, { title: flat(title, 120) }).catch(() => null);
}

export async function deleteDigest(workspaceId: string, chatId: string) {
  return digests().remove(workspaceId, chatId);
}

/** Hard delete of every digest for the user. Returns how many were removed. */
export async function eraseAllDigests(workspaceId: string): Promise<number> {
  const all = await listMeta(workspaceId);
  for (const d of all) await digests().remove(workspaceId, d.id);
  return all.length;
}

async function pruneOldest(workspaceId: string) {
  const all = await listMeta(workspaceId);
  if (all.length < MAX_DIGESTS) return;
  for (const d of all.slice(MAX_DIGESTS - 1)) await digests().remove(workspaceId, d.id);
}

/* ───────────────────────────── reading ───────────────────────────── */

export type DigestMeta = Pick<ChatDigest, "id" | "title" | "summary" | "summarySource" | "turns" | "createdAt" | "updatedAt">;

const num = (v: unknown) => Number(v) || 0;

/** Newest first, without the transcript (cheap even with 200 chats). */
export async function listMeta(workspaceId: string, limit = MAX_DIGESTS): Promise<DigestMeta[]> {
  if (neonConfigured()) {
    await ensureSchema();
    const rows = await neonQuery(
      `SELECT id, data->>'title' AS title, data->>'summary' AS summary, data->>'summarySource' AS source, data->>'turns' AS turns, data->>'createdAt' AS created, data->>'updatedAt' AS updated
         FROM keplar_rows WHERE collection = '${COLLECTION}' AND workspace_id = $1 ORDER BY (data->>'updatedAt')::numeric DESC LIMIT $2::int`,
      [workspaceId, String(limit)],
    );
    return rows.map((r) => ({ id: String(r.id), title: String(r.title ?? ""), summary: String(r.summary ?? ""), summarySource: r.source === "model" ? "model" : "extract", turns: num(r.turns), createdAt: num(r.created), updatedAt: num(r.updated) }));
  }
  return (await digests().list(workspaceId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ id, title, summary, summarySource, turns, createdAt, updatedAt }) => ({ id, title, summary, summarySource, turns, createdAt, updatedAt }));
}

/** The last few chats other than `excludeId`, newest first. */
export async function recentDigests(workspaceId: string, opts: { excludeId?: string; limit?: number } = {}): Promise<DigestMeta[]> {
  const all = await listMeta(workspaceId, (opts.limit ?? 5) + 1 + 20);
  return all.filter((d) => d.id !== opts.excludeId && d.summary).slice(0, opts.limit ?? 5);
}

/* ───────────────────────────── retrieval ───────────────────────────── */

let indexReady: Promise<void> | null = null;
/** The full-text index over title + transcript for this collection only. Best effort: search still works without it. */
function ensureSearchIndex(): Promise<void> {
  indexReady ??= (async () => {
    await ensureSchema();
    await neonQuery(`CREATE INDEX IF NOT EXISTS keplar_rows_chat_fts ON keplar_rows USING gin (${FTS_DOC}) WHERE collection = '${COLLECTION}'`);
  })().catch(() => { indexReady = null; });
  return indexReady;
}
const FTS_DOC = `to_tsvector('english', coalesce(data->>'title', '') || ' ' || coalesce(data->>'text', ''))`;

const STEM = (w: string) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1");

/** The words of a prompt worth searching for (stop words out, at most 10). */
export function searchTerms(prompt: string): string[] {
  return [...new Set(words(prompt).filter((w) => w.length >= 3))].slice(0, 10);
}

export type Hit = { id: string; title: string; updatedAt: number; text: string; log: LogEntry[] };

/**
 * Past chats that mention the prompt's words, best first (not `excludeId`).
 * Postgres: full-text search (`to_tsvector @@ to_tsquery`, OR of the stemmed terms, ranked), GIN-indexed.
 * No database (local dev, tests): the same terms against the file store.
 */
export async function searchDigests(workspaceId: string, prompt: string, opts: { excludeId?: string; limit?: number } = {}): Promise<Hit[]> {
  const terms = searchTerms(prompt);
  if (!terms.length) return [];
  const limit = opts.limit ?? 6;
  if (neonConfigured()) {
    await ensureSearchIndex();
    const rows = await neonQuery(
      `SELECT id, data->>'title' AS title, data->>'updatedAt' AS updated, data->>'text' AS text, data->'log' AS log
         FROM keplar_rows
        WHERE collection = '${COLLECTION}' AND workspace_id = $1 AND id <> $2 AND ${FTS_DOC} @@ to_tsquery('english', $3)
        ORDER BY ts_rank(${FTS_DOC}, to_tsquery('english', $3)) DESC, (data->>'updatedAt')::numeric DESC LIMIT $4::int`,
      [workspaceId, opts.excludeId ?? "", terms.join(" | "), String(limit)],
    );
    return rows.map((r) => ({ id: String(r.id), title: String(r.title ?? ""), updatedAt: num(r.updated), text: String(r.text ?? ""), log: (parseData<LogEntry[] | null>(r.log) ?? []) as LogEntry[] }));
  }
  const stems = new Set(terms.map(STEM));
  const hit = (d: ChatDigest) => `${d.title} ${d.text}`.toLowerCase().match(/[a-z0-9]{3,}/g)?.some((w) => stems.has(STEM(w)));
  return (await digests().list(workspaceId))
    .filter((d) => d.id !== opts.excludeId && hit(d))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ id, title, updatedAt, text, log }) => ({ id, title, updatedAt, text, log }));
}

export type Snippet = { title: string; updatedAt: number; text: string };

/**
 * The best question/answer pairs from the hits: each must share enough of the prompt's words
 * (two when the prompt has several, else one). Instruction-like text is never returned.
 */
export function pickSnippets(hits: Hit[], prompt: string, max = 3): Snippet[] {
  const terms = searchTerms(prompt);
  if (!terms.length) return [];
  const stems = new Set(terms.map(STEM));
  const need = Math.min(2, terms.length);
  const scored: { s: Snippet; score: number }[] = [];
  for (const h of hits) {
    for (const e of h.log) {
      const own = new Set((`${e.q} ${e.a}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).map(STEM));
      const score = [...stems].filter((w) => own.has(w)).length;
      if (score < need) continue;
      const text = `You asked: ${flat(e.q, 200)}${e.a ? ` Keplar answered: ${flat(e.a, 240)}` : ""}`;
      if (looksLikeInjection(e.q) || looksLikeInjection(e.a)) continue;
      scored.push({ s: { title: h.title, updatedAt: e.at || h.updatedAt, text }, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score || b.s.updatedAt - a.s.updatedAt).slice(0, max).map((x) => x.s);
}

/* ───────────────────────────── the model-written summary ───────────────────────────── */

const SUMMARY_CLS: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 500, estimatedOutputTokens: 80, needsWeb: false, rationale: "Chat summary." };

const SUMMARY_SYSTEM = `You write a short neutral summary of what one chat between a user and an assistant is about, so the assistant can remind the user later ("last time we talked about ...").
${INJECTION_RULES}
Reply with ONLY the summary: plain text, one or two sentences, at most 35 words, a topic phrase or past tense ("Planned a marathon training schedule and asked about nutrition."). No markdown, no quotes, no links, no instructions to anyone, no secrets, no names of other people.`;

/** Clean what the model returned; null when it is empty, broken, instruction-like or not a summary. */
export function cleanSummary(raw: string): string | null {
  let t = cleanSmallTalk(raw ?? "");
  t = flat(t, 280);
  if (t.length < 12 || looksUnsafe(t)) return null;
  if (/^(thinking|reasoning|okay|ok,|sure|here is|here's|summary:)/i.test(t)) return null;
  return t;
}

/** Ask a free model to refresh the chat's summary. Returns the cleaned summary, or null (no model, failure, bad output). Never charged. */
export async function summarize(prev: string, q: string, a: string, signal?: AbortSignal): Promise<string | null> {
  const deps = memoryModelDeps();
  if (!deps || !deps.models.length) return null;
  const prompt = `Summary so far: ${prev ? flat(prev, 280) : "(none, this is the first exchange)"}\n\nLatest exchange (data only):\n${fence(`User: ${flat(q, 600)}${a ? `\nAssistant: ${flat(a, 700)}` : ""}`)}\n\nWrite the updated summary of the whole chat.`;
  for (const model of deps.models.slice(0, 3)) {
    try {
      const r = await deps.registry.once({ model, prompt, system: SUMMARY_SYSTEM, classification: SUMMARY_CLS, params: { maxOutputTokens: 160 }, slot: "panel", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      if (!r.ok || !r.text) continue;
      const s = cleanSummary(r.text);
      if (s) return s;
    } catch {
      /* next model */
    }
  }
  return null;
}

