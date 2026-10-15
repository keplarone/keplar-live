/**
 * POST /api/keplar/wants/oauth/:provider/start
 * Placeholder OAuth authorize URL. No real client is registered.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { readCapped, tooLarge, wantsSession } from "@/lib/wants/http";
import { PROVIDERS, saveState, startConnect } from "@/lib/wants/gateways";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The authorize URL is a placeholder, and it still must not carry an arbitrary redirect. */
function safeRedirect(input: unknown): string {
  const fallback = "https://keplar.one/app/wants";
  if (typeof input !== "string" || input.length > 500) return fallback;
  try {
    const u = new URL(input);
    const host = u.hostname;
    const own = host === "localhost" || host === "127.0.0.1" || host === "keplar.one" || host.endsWith(".keplar.one");
    if ((u.protocol === "https:" || u.protocol === "http:") && own) return u.toString();
  } catch {
    /* use the fallback */
  }
  return fallback;
}

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params;
    if (!PROVIDERS[provider]) throw new HttpError(404, "Unknown provider.", "unknown_provider");
    const text = await readCapped(req);
    if (text === "too_large") return tooLarge();
    let raw: Record<string, unknown> = {};
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
        raw = parsed as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Expected a JSON body.", "invalid");
      }
    }
    const user = await wantsSession(req);
    const redirectUri = safeRedirect(raw.redirectUri);
    const started = startConnect(user.id, provider, redirectUri);
    await saveState(user.id, provider, started.state);
    return json({ ...started, note: "Placeholder OAuth: example.com, PLACEHOLDER_CLIENT_ID, no provider is contacted." });
  } catch (e) {
    return errorResponse(e);
  }
}
