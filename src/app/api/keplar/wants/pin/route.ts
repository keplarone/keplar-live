/**
 * GET  /api/keplar/wants/pin  — whether this account has a PIN (never the PIN)
 * POST /api/keplar/wants/pin  — { pin, currentPin? } sets or changes it. Stored hashed.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { readCapped, tooLarge, wantsSession } from "@/lib/wants/http";
import { pinIsSet, pinStoreDurable, setPin } from "@/lib/wants/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function persistence() {
  return pinStoreDurable()
    ? { durable: true as const }
    : { durable: false as const, persistence: "ephemeral" as const, note: "No database is configured on this server, so this PIN lasts only for this instance." };
}

export async function GET(req: Request) {
  try {
    const user = await wantsSession(req);
    return json({ set: await pinIsSet(user.id), ...persistence() });
  } catch (e) {
    return errorResponse(e);
  }
}

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
    const pin = typeof o.pin === "string" ? o.pin : "";
    const current = typeof o.currentPin === "string" ? o.currentPin : null;
    const result = await setPin(user.id, pin, current);
    if (result === "bad_format") throw new HttpError(400, "Use a 4–6 digit PIN.", "bad_format");
    if (result === "bad_current") throw new HttpError(403, "The current PIN doesn't match. Nothing was changed.", "bad_current");
    return json({ status: "set", ...persistence() });
  } catch (e) {
    return errorResponse(e);
  }
}
