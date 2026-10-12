/**
 * Answer recovery, browser side (server: src/lib/orchestration/turn-recovery.ts).
 * Every send gets a random turn key. When the stream drops after the question reached Keplar, the card says it is reconnecting and
 * this polls the turn until the run (which keeps going on the server) has saved its answer, then the answer is shown as if it had
 * streamed. Nothing is simulated: every state shown comes from GET /api/keplar/turn.
 */
import type { KeplarAnswer } from "@/lib/orchestration/types";
import { activeScopeHeaders } from "./scope";

/** 32 random hex characters (the server accepts [A-Za-z0-9_-]{16,64}). */
export function newTurnKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type TurnState = { status: "running" | "done" | "failed" | "cancelled" | "missing"; answer?: KeplarAnswer; error?: { code: string; message: string }; headless?: boolean };

/** Waits between polls: quick at first (most dropped answers are seconds from done), then steady. */
export const POLL_DELAYS_MS = [800, 1200, 2000, 3000];
/** Longer than the server's run limit (300 s), so a run that is still going is never given up on early. */
export const POLL_DEADLINE_MS = 6 * 60_000;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });

/**
 * Poll until the turn is no longer running (or the deadline). Network blips while polling are retried, not reported.
 * `fetchImpl` and `now` are injectable for tests.
 */
export async function pollTurn(key: string, signal: AbortSignal, o: { fetchImpl?: typeof fetch; now?: () => number; deadlineMs?: number; delays?: number[] } = {}): Promise<TurnState> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const delays = o.delays ?? POLL_DELAYS_MS;
  const until = now() + (o.deadlineMs ?? POLL_DEADLINE_MS);
  let last: TurnState = { status: "running" };
  for (let i = 0; now() < until; i++) {
    await wait(delays[Math.min(i, delays.length - 1)], signal);
    try {
      const res = await fetchImpl(`/api/keplar/turn?key=${encodeURIComponent(key)}`, { headers: { ...activeScopeHeaders() }, cache: "no-store", signal });
      if (res.status === 404 || res.status === 400) return { status: "missing" };
      if (!res.ok) continue; // a busy or rate-limited moment: try again
      last = (await res.json()) as TurnState;
      if (last.status !== "running") return last;
    } catch (e) {
      if (signal.aborted) throw e;
      // offline for a moment: keep trying until the deadline
    }
  }
  return last;
}

/** The person pressed Stop: tell a run that may outlive its connection to stop. Fire and forget; survives the page closing. */
export function stopTurn(key: string): void {
  try {
    void fetch("/api/keplar/turn", { method: "POST", headers: { "Content-Type": "application/json", ...activeScopeHeaders() }, body: JSON.stringify({ key, action: "cancel" }), keepalive: true }).catch(() => undefined);
  } catch {
    /* no fetch (tests) */
  }
}
