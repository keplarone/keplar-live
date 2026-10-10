import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { listBanks } from "@/lib/business/plaid";
import { completeStripeBanks } from "@/lib/business/stripe-banks";
import { hideSetupDetail } from "@/lib/business/visibility";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let admin = false;
  try {
    const ws = await owner(req);
    admin = ws.admin;
    const raw = await req.text();
    let sessionId: string | undefined;
    if (raw.trim()) {
      let b: { sessionId?: unknown };
      try {
        b = JSON.parse(raw) as { sessionId?: unknown };
      } catch {
        throw new HttpError(400, "Expected a JSON body.");
      }
      if (b.sessionId != null && typeof b.sessionId !== "string") throw new HttpError(400, "sessionId must be a string.");
      sessionId = typeof b.sessionId === "string" ? b.sessionId : undefined;
    }
    const r = await completeStripeBanks(ws.id, sessionId);
    return json({ ...r, banks: await listBanks(ws.id, false) });
  } catch (e) {
    return errorResponse(hideSetupDetail(e, admin));
  }
}
