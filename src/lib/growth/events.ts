/**
 * Minimal first-party product events for the growth dashboard (collection `growth_events`).
 *
 * Stored: event name, a random per-browser id (`vid`, the same random id the search measurement uses; no account link), a short
 * ask id to pair a start with its finish, and a few coarse numbers (seconds, model counts) or short tags. NEVER stored:
 * prompt or answer text, uploads, emails, account ids, IP addresses, user agents, referrer URLs.
 * Collected only after the visitor allowed Analytics in the cookie banner (re-checked on the server from the consent cookie);
 * Global Privacy Control and Do Not Track visitors are skipped. Retention: 180 days (KEPLAR_RETAIN_GROWTH_EVENTS_DAYS).
 */
import { allows, parseRecord } from "@/lib/consent";
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";

export const GROWTH_EVENTS = ["ask_started", "ask_done", "ask_error", "answer_action", "share_dialog", "share_created", "feedback_submitted", "upgrade_click"] as const;
export type GrowthEvent = (typeof GROWTH_EVENTS)[number];

/** What a person did with a finished answer. Used to define activation. */
export const ANSWER_ACTIONS = ["open_consensus", "open_models", "open_disagreements", "open_verification", "open_reasoning", "copy", "retry", "share"] as const;
export type AnswerAction = (typeof ANSWER_ACTIONS)[number];

export type GrowthRow = {
  id: string;
  workspaceId: string;
  at: string;
  day: string;
  event: GrowthEvent;
  vid: string;
  aid?: string;
  /** "single" | "consensus" */
  mode?: string;
  /** seconds from send to the finished answer (rounded) */
  secs?: number;
  consulted?: number;
  responded?: number;
  /** a visible disagreement between models */
  disagreed?: boolean;
  action?: AnswerAction;
  /** error class: network | server | no_response | limit */
  kind?: string;
  /** free | paid, never an account id */
  tier?: string;
};

const SYSTEM = "system";
const rows = () => collection<GrowthRow>("growth_events");

const tag = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : undefined);
const int = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : undefined);

export type GrowthInput = Omit<GrowthRow, "id" | "workspaceId" | "at" | "day">;

/** Strict allow-list validation. Anything else is dropped; free text never reaches the database. */
export function sanitizeGrowthEvent(body: unknown): GrowthInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const event = GROWTH_EVENTS.find((e) => e === b.e);
  const vid = tag(b.vid, /^[a-f0-9]{16,32}$/);
  if (!event || !vid) return null;
  const action = ANSWER_ACTIONS.find((a) => a === b.action);
  const out: GrowthInput = {
    event,
    vid,
    aid: tag(b.aid, /^[a-z0-9_]{4,32}$/),
    mode: b.mode === "single" || b.mode === "consensus" ? b.mode : undefined,
    secs: int(b.secs, 600),
    consulted: int(b.consulted, 12),
    responded: int(b.responded, 12),
    disagreed: typeof b.disagreed === "boolean" ? b.disagreed : undefined,
    action,
    kind: tag(b.kind, /^(network|server|no_response|limit|other)$/),
    tier: b.tier === "free" || b.tier === "paid" ? b.tier : undefined,
  };
  for (const k of Object.keys(out) as (keyof GrowthInput)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** True when the request carries a consent cookie that allows analytics, and no GPC / DNT signal. */
export function growthConsentOk(headers: Headers): boolean {
  if (headers.get("sec-gpc") === "1" || headers.get("dnt") === "1") return false;
  const m = /(?:^|;\s*)keplar_consent=([^;]+)/.exec(headers.get("cookie") ?? "");
  return Boolean(m && allows(parseRecord(m[1]), "analytics"));
}

let lastPrune = 0;
export async function recordGrowthEvent(input: GrowthInput, at = new Date()): Promise<GrowthRow> {
  const iso = at.toISOString();
  // Opportunistic retention: at most once an hour per instance, bounded batch, never blocks or fails the write.
  if (Date.now() - lastPrune > 3_600_000) {
    lastPrune = Date.now();
    void pruneGrowthEvents().catch(() => undefined);
  }
  return rows().insert({ id: id("ge"), workspaceId: SYSTEM, at: iso, day: iso.slice(0, 10), ...input });
}

export const retainGrowthDays = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.KEPLAR_RETAIN_GROWTH_EVENTS_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 180;
};

export async function pruneGrowthEvents(at = Date.now(), batch = 5000): Promise<number> {
  return rows().purgeSystemBefore("at", new Date(at - retainGrowthDays() * 864e5).toISOString(), batch);
}

export async function growthRows(days: number, at = Date.now()): Promise<GrowthRow[]> {
  return rows().listSystemRange({ field: "at", gte: new Date(at - days * 864e5).toISOString() }, 50_000);
}

/* ── pure summaries (unit-tested) ─────────────────────────────────────────── */

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
export const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(0.9 * xs.length))] : null);

/** An ask that started but never reported an end this long ago counts as abandoned (tab closed, navigated away, or still waiting). */
export const ABANDON_AFTER_MS = 3 * 60_000;

export type AskSummary = {
  browsers: number;
  asksStarted: number;
  asksDone: number;
  asksFailed: number;
  asksAbandoned: number;
  medianSecs: number | null;
  p90Secs: number | null;
  multiModelShare: number | null;
  disagreementShare: number | null;
  errorKinds: Record<string, number>;
  /** Browsers whose first completed answer was followed by a deliberate action (see ACTIVATION in docs/growth/ACTIVATION.md). */
  activatedBrowsers: number;
  browsersWithAnswer: number;
  repeatBrowsers: number;
  actions: Record<string, number>;
};

/**
 * Activation (definition, docs/growth/ACTIVATION.md): a browser got a finished answer AND then did at least one of
 * open a detail section (consensus, models, disagreements, verification, reasoning), copy, share, or ask a second question.
 * Repeat use: finished answers on two or more different days.
 */
export function summarizeAsks(list: GrowthRow[], now = Date.now()): AskSummary {
  const browsers = new Set<string>();
  const started = new Map<string, GrowthRow>();
  const ended = new Set<string>();
  const done: GrowthRow[] = [];
  const failed: GrowthRow[] = [];
  const byVid = new Map<string, GrowthRow[]>();
  const actions: Record<string, number> = {};
  for (const r of list) {
    browsers.add(r.vid);
    (byVid.get(r.vid) ?? byVid.set(r.vid, []).get(r.vid)!).push(r);
    if (r.event === "ask_started") started.set(r.aid ?? r.id, r);
    else if (r.event === "ask_done") {
      done.push(r);
      if (r.aid) ended.add(r.aid);
    } else if (r.event === "ask_error") {
      failed.push(r);
      if (r.aid) ended.add(r.aid);
    } else if (r.event === "answer_action" && r.action) actions[r.action] = (actions[r.action] ?? 0) + 1;
  }
  const abandoned = [...started.entries()].filter(([aid, r]) => !ended.has(aid) && now - Date.parse(r.at) > ABANDON_AFTER_MS).length;
  const secs = done.map((r) => r.secs).filter((x): x is number => typeof x === "number");
  const multi = done.filter((r) => r.mode);
  const kinds: Record<string, number> = {};
  for (const r of failed) kinds[r.kind ?? "other"] = (kinds[r.kind ?? "other"] ?? 0) + 1;

  let activated = 0;
  let withAnswer = 0;
  let repeat = 0;
  for (const evs of byVid.values()) {
    const sorted = [...evs].sort((a, b) => (a.at < b.at ? -1 : 1));
    const firstDone = sorted.findIndex((r) => r.event === "ask_done");
    if (firstDone < 0) continue;
    withAnswer++;
    const after = sorted.slice(firstDone + 1);
    if (after.some((r) => r.event === "answer_action" || r.event === "ask_started" || r.event === "share_created")) activated++;
    if (new Set(sorted.filter((r) => r.event === "ask_done").map((r) => r.day)).size >= 2) repeat++;
  }
  return {
    browsers: browsers.size,
    asksStarted: started.size,
    asksDone: done.length,
    asksFailed: failed.length,
    asksAbandoned: abandoned,
    medianSecs: median(secs),
    p90Secs: p90(secs),
    multiModelShare: multi.length ? multi.filter((r) => r.mode === "consensus").length / multi.length : null,
    disagreementShare: multi.filter((r) => r.mode === "consensus").length ? done.filter((r) => r.mode === "consensus" && r.disagreed).length / done.filter((r) => r.mode === "consensus").length : null,
    errorKinds: kinds,
    activatedBrowsers: activated,
    browsersWithAnswer: withAnswer,
    repeatBrowsers: repeat,
    actions,
  };
}
