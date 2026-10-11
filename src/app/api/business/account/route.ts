import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { getBusinessAccount, parseBusinessAccount, publicAccount, saveBusinessAccount } from "@/lib/business/account";
import { BUSINESS_TIERS, businessTierOf, hasBusinessAccess } from "@/lib/business/tiers";
import { getDesktopRelease } from "@/lib/desktop/releases";

export const runtime = "nodejs";

/** Read on business.keplar.one itself (same origin, with its own Business session); never cached. */
function noStore(res: Response): Response {
  res.headers.set("cache-control", "no-store");
  return res;
}

/**
 * The signed-in visitor's Business status for the storefront: signed in or not, their business account, plan and tier, and
 * (only with an active Business plan, checked here on the server) the Keplar desktop download links.
 */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "business_account", { perIp: 60 });
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    if (ws.anonymous || !ws.userId) return noStore(json({ signedIn: false }));
    const account = await getBusinessAccount(ws.id);
    const active = hasBusinessAccess(ws.plan, ws.admin);
    let download: { version: string; files: { os: string; arch: string; type: string; url: string; size: number }[]; notesUrl: string } | null = null;
    if (active) {
      // The Keplar Business desktop app, from its own repo (keplarone/keplar-business).
      const r = await getDesktopRelease(fetch, "business");
      if (r.status === "ok") download = { version: r.release.version, notesUrl: r.release.notesUrl, files: r.release.files.filter((f) => ["exe", "dmg", "AppImage", "deb"].includes(f.type)).map((f) => ({ os: f.os, arch: f.arch, type: f.type, url: f.url, size: f.size })) };
    }
    // The workspace's entitlements already carry the tier bought (its label is the tier's name; see tierEntitlements).
    const tier = !active ? null : ws.admin ? "enterprise" : (Object.values(BUSINESS_TIERS).find((t) => t.name === ws.entitlements.label)?.id ?? businessTierOf(null));
    return noStore(json({
      signedIn: true,
      email: ws.email,
      verified: ws.verified,
      account: publicAccount(account),
      active,
      plan: active ? { tier, name: ws.entitlements.label || (tier ? BUSINESS_TIERS[tier].name : "") } : null,
      download,
    }));
  } catch (e) {
    return noStore(errorResponse(e));
  }
}

/** Create or update the business account (from business.keplar.one/account; same origin, signed in and verified). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "business_account_save", { perIp: 10 });
    const ws = await requireAccount(req);
    await rateLimit(`acct:${ws.id}:business_account_save`, 10);
    if (!ws.email) throw new HttpError(400, "Your account needs an email address.");
    const parsed = parseBusinessAccount(await body(req));
    if (!parsed.ok) return json({ error: "Some fields need attention.", fields: parsed.errors }, { status: 422 });
    const row = await saveBusinessAccount(ws.id, ws.email, parsed.data);
    return json({ account: publicAccount(row) });
  } catch (e) {
    return errorResponse(e);
  }
}
