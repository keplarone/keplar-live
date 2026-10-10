/**
 * Embed widgets (BETA), managed from Account → Embed.
 *   GET  -> your widgets, plan policy, snippet base.
 *   POST { name, theme?, size?, accent?, models?, origins? } -> create.
 * Session, same-origin, personal workspace only.
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin, SAFE_METHODS } from "@/lib/security/origin";
import { EMBED_POLICY, EMBED_STATEMENT, EMBED_THEMES, EMBED_SIZES, EMBED_ACCENTS, EMBED_MODEL_LANES, EMBED_ACCENT_HEX, EMBED_SIZE_PX } from "@/lib/embed/config";
import { createWidget, embedSnippet, listWidgets, publicWidget } from "@/lib/embed/store";
import { originFor } from "@/lib/referrals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(req: Request) {
  if (!SAFE_METHODS.has(req.method.toUpperCase())) assertSameOrigin(req);
  const ws = await requireAccount(req);
  await limitRequest(req, "embed-admin", { perIp: 60, perAccount: 30, accountId: ws.id });
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const pol = EMBED_POLICY[ws.admin ? "business" : ws.plan];
    const origin = originFor(req);
    const widgets = (await listWidgets(ws.id)).map((w) => ({ ...publicWidget(w), snippet: embedSnippet(origin, w) }));
    return json({
      beta: true,
      plan: ws.plan,
      available: pol.available || ws.admin,
      policy: pol,
      statement: EMBED_STATEMENT,
      options: { themes: EMBED_THEMES, sizes: EMBED_SIZES, accents: EMBED_ACCENTS, accentHex: EMBED_ACCENT_HEX, sizePx: EMBED_SIZE_PX, models: ws.plan === "free" ? ["free"] : EMBED_MODEL_LANES },
      widgets,
      scriptUrl: `${origin}/embed.js`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ name?: unknown; theme?: unknown; size?: unknown; accent?: unknown; models?: unknown; origins?: unknown }>(req);
    const row = await createWidget(ws.admin ? { ...ws, plan: "business" } : ws, b);
    const origin = originFor(req);
    return json({ widget: { ...publicWidget(row), snippet: embedSnippet(origin, row) } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
