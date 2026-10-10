/** POST /api/client-error { name?, message?, digest?, path? } — the browser's error boundaries report here. Scrubbed, rate limited, grouped by fingerprint. */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { recordError } from "@/lib/ops/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    await limitRequest(req, "client-error", { perIp: 10, windowSec: 600 });
    const b = await body<Record<string, unknown>>(req);
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    await recordError({ source: "client", name: str(b.name, 60) || "Error", message: str(b.message, 300), route: str(b.path, 200) || "unknown", sample: str(b.digest, 60) });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
