import { readText } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { growthConsentOk, recordGrowthEvent, sanitizeGrowthEvent } from "@/lib/growth/events";

/**
 * POST /api/growth/event: one product event from the browser (name, random browser id, ask id, coarse numbers).
 * Same-origin only (src/proxy.ts), consent re-checked from the consent cookie, rate-limited per IP, allow-list validated,
 * 1 KB body cap. Always answers 204 so it can never break a page; nothing is echoed back. No prompt or answer text is accepted.
 */
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!growthConsentOk(req.headers)) return NO_CONTENT();
  try {
    await rateLimit(`ip:${clientIpOf(req)}:growth`, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NO_CONTENT();
    throw e;
  }
  const text = await readText(req, 4096).catch(() => null);
  if (text === null || text.length > 1024) return NO_CONTENT();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }
  const input = sanitizeGrowthEvent(body);
  if (!input) return NO_CONTENT();
  try {
    await recordGrowthEvent(input);
  } catch (e) {
    console.error("[growth] event not recorded:", e instanceof Error ? e.name : "error");
  }
  return NO_CONTENT();
}
