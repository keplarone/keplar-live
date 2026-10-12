import type { KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import { activeScopeHeaders } from "./scope";
import { sequencer, validEvent } from "@/lib/orchestration/event-contract";

export class StreamNetworkError extends Error {
  /** false when the request never got a response (offline, DNS, refused): nothing can have been charged for it. */
  constructor(message: string, public reached = true) {
    super(message);
  }
}
export class StreamHttpError extends Error {
  /** The server's error code when it sent one (for example "turn_running": an earlier send of this turn is still being answered). */
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/**
 * POSTs to /api/keplar and yields NDJSON events as they arrive. A dropped
 * connection surfaces as StreamNetworkError so the UI can offer a retry.
 */
export async function* streamKeplar(req: KeplarRequest, signal: AbortSignal): AsyncGenerator<KeplarEvent> {
  let res: Response;
  try {
    res = await fetch("/api/keplar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...activeScopeHeaders() },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new StreamNetworkError("Couldn't reach Keplar.", false);
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string; daily?: { limit: number; resetsAt: string }; resetsAt?: string } | null;
    // Free daily limit: say when it resets in the visitor's own clock.
    if (res.status === 429 && body?.code === "daily_limit" && body.daily?.resetsAt) {
      // Shown as the limit card (what resets when, why there is nothing to buy on Free, and the upgrade), not as a generic error.
      yield { type: "limit", required: 0, remaining: 0, daily: { limit: body.daily.limit, resetsAt: body.daily.resetsAt } };
      return;
    }
    // Shared daily budget paused Free. Not this person's questions, and not a monthly credit balance.
    if (res.status === 429 && body?.code === "daily_budget") {
      yield { type: "limit", required: 0, remaining: 0, budget: "day", ...(body.resetsAt ? { resetsAt: body.resetsAt } : {}) };
      return;
    }
    throw new StreamHttpError(res.status, body?.error ?? "Keplar couldn't process that request.", body?.code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminal = false;
  // The event contract (event-contract.ts): a malformed or unknown line is skipped (it used to end the answer as a dropped
  // connection), and a duplicate or stale event (seq not newer) is dropped.
  const inOrder = sequencer();
  let skipped = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { skipped++; continue; }
        const event = validEvent(parsed);
        if (!event) { skipped++; continue; }
        if (!inOrder(event as KeplarEvent & { seq?: unknown })) continue;
        if (event.type === "answer" || event.type === "limit" || event.type === "error") sawTerminal = true;
        yield event;
      }
    }
  } catch (e) {
    if (signal.aborted) throw e;
    throw new StreamNetworkError("The connection dropped before the answer finished.");
  }
  if (skipped) console.warn(`[keplar] skipped ${skipped} malformed stream event(s)`);
  if (!sawTerminal && !signal.aborted) throw new StreamNetworkError("The connection closed before the answer finished.");
}
