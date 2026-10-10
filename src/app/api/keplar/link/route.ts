/**
 * POST /api/keplar/link { url, purpose?: "answer" | "reference" } → what Keplar read at that link (src/lib/attachments/link.ts).
 * Works signed out too (a public page is not private data), same-origin only, rate limited per IP and per account.
 * Nothing is stored: the text goes back to the composer and travels with the question for this message only.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { clientIpOf, limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { dailyLimit } from "@/lib/tools/access";
import { limitsForPlan } from "@/lib/attachments/kinds";
import { LinkError, readLink } from "@/lib/attachments/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "keplar-link", { perIp: 20, perAccount: 30, accountId: ws.anonymous ? null : ws.id, windowSec: 60 });
    const L = limitsForPlan(ws.anonymous ? "free" : ws.plan);
    await dailyLimit(`link:${ws.anonymous ? `ip:${clientIpOf(req)}` : ws.id}`, ws.anonymous ? 20 : L.linkReadsPerDay, "reading links");
    const b = (await req.json().catch(() => null)) as { url?: unknown; purpose?: unknown } | null;
    const url = typeof b?.url === "string" ? b.url.trim() : "";
    if (!url || url.length > 2048) throw new HttpError(400, "Send the link to read.", "invalid");
    const free = ws.anonymous || ws.plan === "free";
    const r = await readLink(url, { ...L, linkChars: free ? 14_000 : 32_000 });
    return json({ ...r, design: b?.purpose === "reference" ? r.design : undefined }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LinkError) return json({ error: e.message, code: e.code }, { status: e.code === "private" || e.code === "invalid_url" ? 400 : 422 });
    return errorResponse(e);
  }
}
