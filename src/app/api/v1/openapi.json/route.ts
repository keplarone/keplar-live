/** GET /api/v1/openapi.json: the public API description (no auth, cacheable). */
import { openApiSpec } from "@/lib/api/openapi";
import { CORS } from "@/lib/api/http";

export const runtime = "nodejs";

export function GET(req: Request) {
  const origin = process.env.BETTER_AUTH_URL || new URL(req.url).origin;
  return Response.json(openApiSpec(origin), { headers: { "cache-control": "public, max-age=300", ...CORS } });
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
