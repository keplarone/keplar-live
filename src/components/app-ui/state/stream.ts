import type { KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import { activeScopeHeaders } from "./scope";

export class StreamNetworkError extends Error {
  /** false when the request never got a response (offline, DNS, refused): nothing can have been charged for it. */
  constructor(message: string, public reached = true) {
    super(message);
  }
}
export class StreamHttpError extends Error {
  constructor(public status: number, message: string) {
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
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string; daily?: { limit: number; resetsAt: string } } | null;
    // Free daily limit: say when it resets in the visitor's own clock.
    if (res.status === 429 && body?.code === "daily_limit" && body.daily?.resetsAt) {
      // Shown as the limit card (what resets when, why there is nothing to buy on Free, and the upgrade), not as a generic error.
      yield { type: "limit", required: 0, remaining: 0, daily: { limit: body.daily.limit, resetsAt: body.daily.resetsAt } };
      return;
    }
    throw new StreamHttpError(res.status, body?.error ?? "Keplar couldn't process that request.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminal = false;
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
        const event = JSON.parse(line) as KeplarEvent;
        if (event.type === "answer" || event.type === "limit" || event.type === "error") sawTerminal = true;
        yield event;
      }
    }
  } catch (e) {
    if (signal.aborted) throw e;
    throw new StreamNetworkError("The connection dropped before the answer finished.");
  }
  if (!sawTerminal && !signal.aborted) throw new StreamNetworkError("The connection closed before the answer finished.");
}
