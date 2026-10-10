import { json } from "@/lib/create/platform/http";
import { webhookTokenValid } from "@/lib/higgsfield/client";
import { refreshById } from "@/lib/higgsfield/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Higgsfield completion webhook. The delivery has no documented signature, so:
 *  1. the URL carries an HMAC token Keplar minted for this exact job (a stranger cannot guess it);
 *  2. the body is never trusted: it only triggers a status read with Keplar's own credentials, and finalizing is idempotent.
 * Valid duplicates answer 2xx; an invalid token answers 4xx (Higgsfield treats 4xx as permanent and stops retrying).
 */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const w = u.searchParams.get("w") ?? "";
  const j = u.searchParams.get("j") ?? "";
  const t = u.searchParams.get("t") ?? "";
  if (!w || !j || !webhookTokenValid(w, j, t)) return json({ error: "Not found" }, { status: 404 });
  const payload = (await req.json().catch(() => null)) as { request_id?: unknown; status?: unknown } | null;
  if (!payload || typeof payload.request_id !== "string" || typeof payload.status !== "string") return json({ error: "Unexpected payload" }, { status: 400 });
  try {
    await refreshById(w, j);
  } catch (e) {
    console.error("[higgsfield webhook] refresh failed:", e instanceof Error ? e.name : "error");
    return json({ ok: false }, { status: 500 }); // retried by Higgsfield; polling also recovers
  }
  return json({ ok: true });
}
