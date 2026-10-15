/**
 * POST /api/keplar/wants/orchestrate
 * Signed-in session (the same cookie as the rest of the app). 50MB body cap, 15s timeout.
 * Refusals and escalations are JSON, not empty errors. Nothing runs before a verified PIN.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { parseWant, readCapped, tooLarge, wantsSession } from "@/lib/wants/http";
import { orchestrateWant, timeoutResult } from "@/lib/wants/orchestrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const text = await readCapped(req);
    if (text === "too_large") return tooLarge();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Expected a JSON body.", "invalid");
    }
    const user = await wantsSession(req);
    const body = parseWant(raw);
    const result = await orchestrateWant(user.id, body);
    if (result === "timeout") return json(timeoutResult(), { status: 504 });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
