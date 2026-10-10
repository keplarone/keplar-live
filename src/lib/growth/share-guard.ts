/**
 * Public-view guard for shared answers: /r/<token>, /answers/<slug> and its OG image, shared chats /c/<token> and shared specialists /sp/<token>.
 * Per-IP rate limit (stops token guessing and scraping; a normal reader opens a page a handful of times a minute) and the
 * response a limited visitor gets. Counts only, no content.
 */
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";

export const SHARE_VIEW_PER_MIN = 90;

/** Is this path a single shared answer (private link, public page or its OG image)? The /answers index is not. */
export const isShareViewPath = (pathname: string) => /^\/c\/[^/]+\/?$/.test(pathname) || /^\/sp\/[^/]+\/?$/.test(pathname) || /^\/r\/[^/]+\/?$/.test(pathname) || /^\/r\/[^/]+\/og\/?$/.test(pathname) || /^\/answers\/[^/]+(?:\/og)?\/?$/.test(pathname);

/** Null when the visitor may continue, else a ready 429 (plain text, noindex, Retry-After). */
export async function shareViewLimited(req: Request, pathname: string, max = SHARE_VIEW_PER_MIN): Promise<Response | null> {
  if (!isShareViewPath(pathname)) return null;
  try {
    await rateLimit(`ip:${clientIpOf(req)}:shareview`, max, 60);
    return null;
  } catch (e) {
    if (!(e instanceof RateLimitError)) throw e;
    return new Response("Too many requests. Please wait a minute and try again.", {
      status: 429,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": String(e.retryAfterSec), "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }
}
