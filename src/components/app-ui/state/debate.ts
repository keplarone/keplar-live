/** Client state for a live Debate (BETA): what the transcript on screen shows while the models argue. Pure, so it is unit-tested. */
import type { DebateEvent, DebateTurnUpdate } from "@/lib/orchestration/types";

export type LiveDebateTurn = {
  round: number;
  seat: number;
  name: string;
  status: "speaking" | "ok" | "failed";
  /** Streaming: raw text so far (protocol lines hidden by the view). Finished: the argument body. */
  text: string;
  position: string;
  update: DebateTurnUpdate | null;
  why: string;
};

export type LiveDebate = {
  rounds: number;
  speakers: Array<{ seat: number; name: string }>;
  /** Round in progress (0 before the first starts). */
  round: number;
  turns: LiveDebateTurn[];
  done: boolean;
  changed?: number;
  /** Debate was asked for but could not run; the question was answered normally. */
  skipped?: string;
};

/** Longest streamed text kept per turn on screen. */
const LIVE_CHARS = 4000;

const empty = (): LiveDebate => ({ rounds: 0, speakers: [], round: 0, turns: [], done: false });

export function applyDebate(d: LiveDebate | undefined, e: DebateEvent): LiveDebate {
  const s = d ?? empty();
  const nameOf = (seat: number) => s.speakers.find((x) => x.seat === seat)?.name ?? `Model ${seat + 1}`;
  const upsert = (round: number, seat: number, fn: (t: LiveDebateTurn) => LiveDebateTurn): LiveDebate => {
    const i = s.turns.findIndex((t) => t.round === round && t.seat === seat);
    const base: LiveDebateTurn = i >= 0 ? s.turns[i]! : { round, seat, name: nameOf(seat), status: "speaking", text: "", position: "", update: null, why: "" };
    const next = fn(base);
    return { ...s, turns: i >= 0 ? s.turns.map((t, j) => (j === i ? next : t)) : [...s.turns, next] };
  };
  switch (e.phase) {
    case "start":
      return { ...s, rounds: e.rounds, speakers: e.speakers, done: false, skipped: undefined };
    case "round":
      return { ...s, round: e.round, rounds: Math.max(s.rounds, e.of) };
    case "turn_start":
      return upsert(e.round, e.seat, (t) => t);
    case "delta":
      return upsert(e.round, e.seat, (t) => (t.status === "speaking" ? { ...t, text: (t.text + e.text).slice(-LIVE_CHARS) } : t));
    case "turn":
      return upsert(e.round, e.seat, (t) => ({ ...t, name: e.name || t.name, status: e.status, text: e.text, position: e.position, update: e.update, why: e.why }));
    case "skipped":
      return { ...s, skipped: e.reason, done: true };
    case "done":
      return { ...s, done: true, changed: e.changed, round: e.rounds, rounds: e.rounds };
  }
}

/** While a turn streams, hide the POSITION / UPDATE protocol lines and show them as labels instead. */
export function streamingView(raw: string): { position: string; update: string; body: string } {
  let position = "";
  let update = "";
  const body: string[] = [];
  for (const line of raw.split("\n")) {
    const p = line.match(/^\s*\**\s*POSITION\s*\**\s*:\s*\**\s*(.*)$/i);
    if (p && !position) { position = p[1]!.trim(); continue; }
    const u = line.match(/^\s*\**\s*UPDATE\s*\**\s*:\s*\**\s*(.*)$/i);
    if (u && !update) { update = u[1]!.trim(); continue; }
    body.push(line);
  }
  return { position, update, body: body.join("\n").trim() };
}
