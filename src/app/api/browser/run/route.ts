/**
 * POST /api/browser/run  { goal, url? }  ->  NDJSON: {type:"step", step} ... then {type:"end", outcome} or {type:"error", error}
 * Keplar Browser: a real, isolated headless Chromium that Keplar drives for this one task (src/lib/browser/run.ts). Signed-in only,
 * same-origin, rate limited. Each step streams to the person with a screenshot; the browser is closed when the task ends.
 * It only opens public websites and stops before anything that spends, sends, deletes or signs in.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { memoryModelDeps } from "@/lib/memory/extract";
import { MAX_GOAL_CHARS, SYSTEM } from "@/lib/browser/policy";
import type { Decide } from "@/lib/browser/run";
import type { Classification } from "@/lib/orchestration/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLS: Classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 2500, estimatedOutputTokens: 120, needsWeb: false, rationale: "Browser step." };

function modelDecide(signal: AbortSignal): Decide | null {
  const deps = memoryModelDeps();
  if (!deps?.models.length) return null;
  return async (prompt) => {
    for (const model of deps.models.slice(0, 3)) {
      try {
        const r = await deps.registry.once({ model, prompt, system: SYSTEM, classification: CLS, params: { maxOutputTokens: 400 }, slot: "panel", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
        if (r.ok && r.text) return r.text;
      } catch {
        /* next model */
      }
    }
    return null;
  };
}

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    await limitRequest(req, "browser-run", { perIp: 20, perAccount: 20, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ goal?: unknown; url?: unknown }>(req);
    const goal = typeof b.goal === "string" ? b.goal.replace(/\s+/g, " ").trim().slice(0, MAX_GOAL_CHARS) : "";
    const url = typeof b.url === "string" ? b.url.trim().slice(0, 2048) : "";
    if (goal.length < 4) throw new HttpError(400, "Say what Keplar should do in the browser.", "invalid");
    const decide = modelDecide(req.signal);
    if (!decide) throw new HttpError(503, "Keplar Browser needs the live models, which are off right now. Nothing was opened.", "unavailable");

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        let open = true;
        const send = (o: unknown) => { if (open) { try { ctl.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { open = false; } } };
        try {
          const [{ withBrowser, BrowserUnavailable }, { runBrowserTask }] = await Promise.all([import("@/lib/site-builder/qa/browser"), import("@/lib/browser/run")]);
          try {
            const outcome = await withBrowser((browser) => runBrowserTask({ goal, url: url || undefined }, { browser, decide, signal: req.signal, onStep: (step) => send({ type: "step", step }) }));
            send({ type: "end", outcome });
          } catch (e) {
            send({ type: "error", error: e instanceof BrowserUnavailable ? e.message : "The browser task didn't finish. Nothing was bought, sent or changed." });
          }
        } catch {
          send({ type: "error", error: "The browser couldn't start." });
        }
        if (open) ctl.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}
