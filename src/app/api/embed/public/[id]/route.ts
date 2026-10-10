/**
 * GET /api/embed/public/:id — public, no auth. Theme/size/accent for the framed UI.
 * Never returns workspace ids or secrets.
 */
import { EMBED_ACCENT_HEX, EMBED_SIZE_PX, looksLikeEmbedId } from "@/lib/embed/config";
import { embedWidgets, normalizeOrigin, widgetAllows } from "@/lib/embed/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!looksLikeEmbedId(id)) return Response.json({ error: "Not found." }, { status: 404, headers: CORS });
  const w = await embedWidgets().findSystemBy("id", id);
  if (!w || w.revokedAt) return Response.json({ error: "Not found." }, { status: 404, headers: CORS });

  // Optional origin probe: if allowlist is set and parent is provided, say whether it would be allowed.
  const url = new URL(req.url);
  const parent = normalizeOrigin(url.searchParams.get("parent"));
  const originOk: boolean | null = w.origins.length ? widgetAllows(w, parent) : null;

  return Response.json(
    {
      id: w.id,
      theme: w.theme,
      size: w.size,
      accent: w.accent,
      accentHex: EMBED_ACCENT_HEX[w.accent],
      models: w.models,
      dims: EMBED_SIZE_PX[w.size],
      originOk,
      hasAllowlist: w.origins.length > 0,
    },
    { headers: CORS },
  );
}
