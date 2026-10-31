import { after } from "next/server";
import { readText } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { consentOk, queueSeoEvent, sanitizeSeoEvent } from "@/lib/seo/events";

/**
 * POST /api/seo/event: one funnel event from the browser (name, landing page path, source class, random browser id).
 * Same-origin only (src/proxy.ts), consent re-checked from the consent cookie, rate-limited per IP, allow-list validated,
 * 1 KB body cap. Always answers 204 so it can never break a page; nothing is echoed back.
 */
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!consentOk(req.headers)) return NO_CONTENT();
  try {
    await rateLimit(`ip:${clientIpOf(req)}:seo`, 40);
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
  const input = sanitizeSeoEvent(body);
  if (!input) return NO_CONTENT();
  // Held and written in batches (flush-gate.ts); while the database is unavailable the batch waits. Always 204.
  const work = queueSeoEvent(input);
  if (work) {
    try {
      after(work);
    } catch {
      await work.catch(() => 0); // outside a request scope (tests, scripts)
    }
  }
  return NO_CONTENT();
}
