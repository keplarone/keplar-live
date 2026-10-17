/**
 * GET /api/sky: which weather sky to paint behind the marketing pages, `{ sky, wind }` (src/lib/sky/weather.ts).
 *
 * Public, read-only and cheap: it reads the approximate location Vercel attaches to the request, rounds it to ~11 km, looks the
 * current weather up on Open-Meteo once per cell per 15 minutes (cached), and answers with a variant name. The location is never
 * stored, logged or echoed back. The answer differs per visitor, so it is cached only by the visitor's own browser.
 */
import { resolveSky, SKY_TTL_SECONDS } from "@/lib/sky/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { sky, wind } = await resolveSky(req);
  return new Response(JSON.stringify({ sky, wind }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `private, max-age=${SKY_TTL_SECONDS}`,
      "x-robots-tag": "noindex",
    },
  });
}
