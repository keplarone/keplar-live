/**
 * POST /api/keplar/wants/orchestrate: one Keplar Wants turn (src/lib/wants/engine.ts).
 *   { state: WantsState | null, input: WantsInput }  ->  NDJSON stream of TurnEvent lines:
 *   {"type":"state",...} the updated state for the client to keep and send back next turn
 *   {"type":"trace",...} routing gate / planner / expert / verifier progress while the mesh works
 *   {"type":"say",...}   a short note,  {"type":"card",...} what to show next (a question, places, an action, the answer)
 * Swarm mode: when KEPLAR_WANTS_SWARM_URL is set, the (already authenticated) turn is forwarded to the standalone Python swarm
 * service (services/keplar-wants-swarm, POST /v1/orchestrate) with the shared KEPLAR_WANTS_SWARM_TOKEN, and its NDJSON events
 * (same protocol) are streamed straight back. If the service can't be reached, the built-in engine below answers instead.
 * Signed in, same origin, rate limited. Model calls go through ToolRun (the plan's models, the spend guard, the plan's
 * allowance) and the turn is charged once, for what the providers billed; Free runs on free models and is never charged.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { preflight, toolDeps, ToolRun, deadline } from "@/lib/tools/run";
import { cleanState, runTurn, type WantsInput } from "@/lib/wants/engine";
import { findPlaces, geocode, reverseGeocode } from "@/lib/wants/places";
import { screenPrompt } from "@/lib/safety/screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A mesh run is at most 9 calls of ~2k tokens; the estimate the allowance must cover before any model is called. */
const ESTIMATE_USD = 0.08;

function cleanInput(raw: unknown): WantsInput {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const loc = o.location as Record<string, unknown> | undefined;
  return {
    ...(str(o.want, 800) ? { want: str(o.want, 800) } : {}),
    ...(str(o.slot, 24) ? { slot: str(o.slot, 24) } : {}),
    ...(typeof o.answer === "string" ? { answer: o.answer.slice(0, 400) } : {}),
    ...(loc && typeof loc.query === "string" ? { location: { query: loc.query.slice(0, 200) } } : loc && typeof loc.lat === "number" && typeof loc.lon === "number" ? { location: { lat: loc.lat, lon: loc.lon } } : {}),
    ...(str(o.placeId, 40) ? { placeId: str(o.placeId, 40) } : {}),
    ...(o.fulfilment === "delivery" || o.fulfilment === "pickup" ? { fulfilment: o.fulfilment } : {}),
    ...(str(o.address, 200) ? { address: str(o.address, 200) } : {}),
    ...(o.delivery === "doordash" || o.delivery === "ubereats" || o.delivery === "grubhub" ? { delivery: o.delivery } : {}),
    ...(o.confirm === true ? { confirm: true } : {}),
    ...(typeof o.pin === "string" && /^\d{4,6}$/.test(o.pin) ? { pin: o.pin } : {}),
  };
}

/** The swarm service's stream, or null when it isn't configured or doesn't answer (the built-in engine runs instead). */
async function forwardToSwarm(payload: unknown, signal: AbortSignal): Promise<Response | null> {
  const base = process.env.KEPLAR_WANTS_SWARM_URL?.replace(/\/+$/, "");
  const token = process.env.KEPLAR_WANTS_SWARM_TOKEN;
  if (!base || !token) return null;
  // 15 s to start answering; once it streams, only the turn's own deadline applies.
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(), 15_000);
  try {
    const r = await fetch(`${base}/v1/orchestrate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.any([signal, connect.signal]) });
    clearTimeout(timer);
    if (!r.ok || !r.body) return null;
    return new Response(r.body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-keplar-wants": "swarm" } });
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    await limitRequest(req, "wants", { perIp: 240, perAccount: 240, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ state?: unknown; input?: unknown }>(req);
    const input = cleanInput(b.input);
    const state = input.want ? null : cleanState(b.state);
    if (!input.want && !state) throw new HttpError(400, "Say what you want first.", "invalid");

    const signal = deadline(req, 280_000);
    // The safety screen runs here, before either backend sees the want.
    if (input.want) {
      const screen = screenPrompt(input.want);
      if (screen.action !== "allow") return new Response(`${JSON.stringify({ type: "card", card: { kind: "refuse", reply: screen.reply } })}\n`, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    }
    // The swarm keeps its own state fields (track, goal stage, ...) and re-validates them itself: forward the client's copy as is.
    const swarm = await forwardToSwarm({ state: input.want ? null : b.state ?? null, input, user: { id: ws.id, plan: ws.plan } }, signal);
    if (swarm) return swarm;

    const deps = toolDeps(ws.plan);
    let run: ToolRun | null = null;
    // The allowance is checked before the first model call; when it says no, that message (not a generic error) is shown.
    let refused: string | null = null;
    const call = deps
      ? async (o: { system: string; prompt: string; maxOutputTokens: number; modelIndex?: number }) => {
          if (refused) throw new Error(refused);
          if (!run) {
            try { await preflight(ws, ESTIMATE_USD); } catch (e) { refused = e instanceof Error ? e.message : "Your plan's allowance is used up."; throw e; }
            run = new ToolRun(ws, deps, signal);
          }
          return run.call(o);
        }
      : null;

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const send = (e: unknown) => { try { ctl.enqueue(enc.encode(`${JSON.stringify(e)}\n`)); } catch { /* client went away */ } };
        try {
          await runTurn(state, input, {
            call,
            models: deps?.models.length ?? 1,
            findPlaces: (s) => findPlaces(s, signal),
            geocode: (q) => geocode(q, signal),
            reverseGeocode: (at) => reverseGeocode(at, signal),
          }, send);
        } catch (e) {
          send({ type: "card", card: { kind: "error", message: e instanceof HttpError ? e.message : "Keplar hit a problem. Try again." } });
        } finally {
          if (refused) send({ type: "card", card: { kind: "error", message: refused } });
          const r = run as ToolRun | null;
          if (r) {
            const credits = await r.settle(ws, "core.wants").catch(() => 0);
            if (credits) send({ type: "billed", credits });
          }
          ctl.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
