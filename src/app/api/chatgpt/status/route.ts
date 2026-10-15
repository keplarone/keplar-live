import { requireAccount } from "@/lib/create/platform/workspace";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { hasBusinessAccess } from "@/lib/business/tiers";
import { grants, requireStorage } from "@/lib/chatgpt/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin, personal-account status only. Never return tokens, grant IDs or another workspace's state. */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "chatgpt_connection_status", { perIp: 60 });
    const ws = await requireAccount(req);
    requireStorage();
    const active = (await grants().list(ws.id)).filter((g) => g.workspaceId === ws.id && g.userId === ws.userId && Date.parse(g.refreshExpiresAt) > Date.now());
    return json({
      state: "ready",
      email: ws.email,
      connected: active.length > 0,
      count: active.length,
      eligible: hasBusinessAccess(ws.plan, ws.admin),
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return json({ state: "signed_out" });
    if (e instanceof HttpError && e.code === "unverified") return json({ state: "unverified" });
    return errorResponse(e);
  }
}
