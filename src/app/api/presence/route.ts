import { readText } from "@/lib/create/platform/http";
import { after } from "next/server";
import { noteHeartbeat } from "@/lib/traffic/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/**
 * POST /api/presence with a plain-text body "hb" (heartbeat) or "bye" (leave). Public, cookie-free, same-origin only (src/proxy.ts),
 * 16-byte body cap, always 204 so it can never break a page; nothing is echoed back. The visitor is an anonymous daily code (see
 * lib/traffic/presence.ts); no IP, path, referrer or account is stored. Skips bots, Do Not Track and Global Privacy Control.
 */
export async function POST(req: Request) {
  const text = await readText(req, 64).catch(() => null);
  if (text === null || text.length > 16) return NO_CONTENT();
  const kind = text.trim() === "hb" ? "hb" : text.trim() === "bye" ? "bye" : null;
  if (!kind) return NO_CONTENT();
  const work = noteHeartbeat(req, kind);
  if (work) {
    try {
      after(work);
    } catch {
      await work; // outside a request scope (tests, scripts)
    }
  }
  return NO_CONTENT();
}
