/**
 * POST /api/keplar/wants/oauth/callback
 * Exchanges a placeholder code only after this account's PIN verifies.
 * The resulting token is simulated and marked as such.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { readCapped, tooLarge, wantsSession } from "@/lib/wants/http";
import { finishConnect } from "@/lib/wants/gateways";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (typeof o.state !== "string" || !o.state) throw new HttpError(400, "state is required.", "invalid");
    if (typeof o.code !== "string" || !o.code) throw new HttpError(400, "code is required.", "invalid");
    const pin = typeof o.pin === "string" ? o.pin : null;
    return json(await finishConnect(user.id, o.state, pin));
  } catch (e) {
    return errorResponse(e);
  }
}
