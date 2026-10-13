/**
 * The chat stream's event contract (NDJSON from /api/keplar, one KeplarEvent per line), versioned.
 *
 * v1: every event carries `v` (the protocol version) and `seq` (1, 2, 3... per response), and the response says
 * `x-keplar-protocol: 1`. Both are additions: a reader that ignores unknown fields reads the stream as before.
 * The browser checks each line with validEvent() before it touches state:
 *   - a line that is not JSON or not a known, well-formed event is skipped and counted (it used to abort the whole answer as
 *     "the connection dropped");
 *   - an event whose `seq` is not newer than the last one applied is a duplicate or stale (a replay racing a live stream) and is
 *     dropped;
 *   - lines without `seq` (an older server during a deploy) are accepted in arrival order.
 * Only shape is checked here, the minimum each reducer case reads; content limits are the server's job.
 */
import type { KeplarEvent } from "./types";

export const EVENT_PROTOCOL = 1;
export const PROTOCOL_HEADER = "x-keplar-protocol";

export type Stamped<E extends KeplarEvent = KeplarEvent> = E & { v: number; seq: number };

/** Server: a stamper for one response (sequence starts at 1). */
export function stamper(): (e: KeplarEvent) => Stamped {
  let seq = 0;
  return (e) => ({ ...e, v: EVENT_PROTOCOL, seq: ++seq });
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown) => typeof x === "string";
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);

/** The fields each event type must have for the browser to use it. Unknown types are rejected. */
const SHAPES: Record<KeplarEvent["type"], (e: Record<string, unknown>) => boolean> = {
  stage: (e) => str(e.stage) && (e.status === "active" || e.status === "done"),
  debate: (e) => isObj(e.debate),
  research: (e) => isObj(e.research),
  core: (e) => isObj(e.core),
  capabilities: (e) => Array.isArray(e.items) && num(e.modelCount),
  model: (e) => str(e.modelId) && str(e.status),
  disagreement: (e) => str(e.summary),
  smalltalk: () => true,
  recovery: (e) => e.state === "replayed" || e.state === "recovering" || e.state === "recovered" || e.state === "lost",
  delta: (e) => str(e.text),
  answer: (e) => isObj(e.answer) && str(e.answer.id) && str(e.answer.markdown) && isObj(e.answer.compute),
  tool: (e) => isObj(e.use) && str(e.use.id),
  memory: (e) => typeof e.enabled === "boolean" && num(e.saved),
  daily: (e) => isObj(e.daily) && num(e.daily.used) && num(e.daily.limit),
  limit: (e) => num(e.required) && num(e.remaining),
  error: (e) => str(e.code) && str(e.message),
};

/** The event, or null when the line isn't a known, well-formed event. */
export function validEvent(x: unknown): KeplarEvent | null {
  if (!isObj(x) || !str(x.type)) return null;
  const check = SHAPES[x.type as KeplarEvent["type"]];
  if (!check || !check(x)) return null;
  if (x.v !== undefined && (!num(x.v) || (x.v as number) > EVENT_PROTOCOL)) return null; // from a newer protocol than this page knows
  return x as KeplarEvent;
}

/** Browser: applies the ordering rule. Returns false for a duplicate or stale event. */
export function sequencer(): (e: KeplarEvent & { seq?: unknown }) => boolean {
  let last = 0;
  return (e) => {
    if (typeof e.seq !== "number") return true; // an older server: arrival order
    if (e.seq <= last) return false;
    last = e.seq;
    return true;
  };
}
