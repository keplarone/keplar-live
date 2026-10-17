/**
 * GET /api/sky/weather: `{ sky, wind }` for the cloud background (src/lib/sky/weather.ts).
 *
 * Reads the approximate location Vercel attaches to the request, rounds it, and looks up the current
 * weather. The coordinates are not stored, logged or returned. Cached per visitor for 15 minutes.
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
