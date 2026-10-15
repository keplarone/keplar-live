import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { HttpError, readFormData } from "@/lib/create/platform/http";
import { siteOrigin, startCheckout } from "@/lib/business/commerce";
import { clientIp, esc, htmlPage, seeOther } from "../_html";

export const runtime = "nodejs";

/** Public "Buy" button target on generated shops → Checkout Session on the owner's connected account. */
export async function POST(req: Request) {
  const form = await readFormData(req, 16_000).catch(() => null);
  if (!form) return htmlPage(400, "Bad request", "<h1>Something went wrong.</h1>");
  try {
    await rateLimit(`checkout:${clientIp(req)}`, 20);
    const { session } = await startCheckout({ projectId: String(form.get("projectId") ?? ""), productId: String(form.get("productId") ?? ""), returnPath: String(form.get("_return") ?? ""), origin: siteOrigin(req.url) });
    return seeOther(session.url);
  } catch (err) {
    const msg = err instanceof HttpError || err instanceof RateLimitError ? err.message : "Something went wrong.";
    return htmlPage(err instanceof HttpError ? err.status : 429, "Checkout unavailable", `<p class="mono">Checkout</p><h1>Checkout unavailable</h1><p>${esc(msg)}</p>`);
  }
}
