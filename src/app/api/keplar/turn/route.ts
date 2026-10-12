import { assertSameAccount } from "@/lib/accounts/account-guard";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { publicTurn, readTurn, requestCancel, turnOwner, validTurnKey } from "@/lib/orchestration/turn-recovery";
import { readDeviceId } from "@/lib/usage/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Answer recovery (src/lib/orchestration/turn-recovery.ts), for the browser that started the turn only.
 *   GET  ?key=<turnKey>                 { status: running | done | failed | cancelled | missing, answer?, error?, headless? }
 *   POST { key, action: "cancel" }      the person pressed Stop: a run that outlived its connection stops at its next check
 * A key from another account or device reads as "missing" (the owner is part of the lookup), never as someone else's turn.
 */
async function owner(req: Request) {
  const ws = await currentWorkspace(req, { allowAnonymous: true, team: true });
  assertSameAccount(req, ws.userId);
  await limitRequest(req, "keplar-turn", { perIp: 120, perAccount: 120, accountId: ws.anonymous ? null : ws.id });
  const who = turnOwner(ws, ws.anonymous ? readDeviceId(req.headers.get("cookie")) : null);
  if (!who) throw new HttpError(404, "Nothing to recover here.", "not_found");
  return who;
}

export async function GET(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("key");
    if (!validTurnKey(key)) throw new HttpError(400, "Which turn?");
    const who = await owner(req);
    return json(publicTurn(await readTurn(who, key)), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { key?: unknown; action?: unknown };
    if (!validTurnKey(b.key) || b.action !== "cancel") throw new HttpError(400, "Send { key, action: \"cancel\" }.");
    const who = await owner(req);
    return json({ ok: true, cancelled: await requestCancel(who, b.key) });
  } catch (e) {
    return errorResponse(e);
  }
}
