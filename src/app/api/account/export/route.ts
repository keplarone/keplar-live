/**
 * GET /api/account/export: everything Keplar holds for the signed-in account, as a JSON download.
 * Signed in + verified only, rate limited per account, streamed collection by collection. Secrets are redacted.
 */
import { requireAccount } from "@/lib/create/platform/workspace";
import { errorResponse } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { exportChunks } from "@/lib/privacy/account-data";
import { logEvent } from "@/lib/ops/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    await limitRequest(req, "account_export", { perIp: 10, perAccount: 3, accountId: ws.id, windowSec: 3600 });
    const row = await getWorkspace(ws.id);
    const gen = exportChunks(ws.id, { id: ws.userId ?? ws.id, email: ws.email ?? "", name: row?.name ?? ws.name, createdAt: row?.createdAt });
    logEvent("info", "account.export", { ws: ws.id }, req);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        const n = await gen.next();
        if (n.done) ctrl.close();
        else ctrl.enqueue(enc.encode(n.value));
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="keplar-export-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
