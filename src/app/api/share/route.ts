/**
 * Answer-comparison links (docs/growth/SHARING.md).
 *   GET    -> the signed-in owner's live links (token, created, expires, views)
 *   POST   { answer, question?, includeQuestion } -> { token, url }   explicit consent only: the owner confirmed in the dialog
 *   DELETE { token } -> revoke (the link stops working at once)
 *   PATCH  { token, public: boolean, consent?: true } -> second, explicit opt-in: also serve this answer at /answers/<slug> where search
 *          engines may index it (verified email required; refused when personal data is detected). public:false turns it off at once.
 *   PATCH  { slug, takedown: true } -> admin only: take a public page down for good.
 * Signed out is 401. Same-origin only for writes. Rate limited. The public page is /r/<token> (noindex).
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { site } from "@/lib/site";
import { publicTitle, publishShare, takeDownPublic, unpublishShare } from "@/lib/growth/share-public";
import { createShare, liveSharesOf, revokeShare, sanitizeSnapshot, ShareLimitError, validToken } from "@/lib/growth/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(req: Request, write: boolean) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req);
  if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to share an answer.", "unauthenticated");
  await limitRequest(req, "share", { perIp: 60, perAccount: 60, accountId: ws.id, windowSec: 600 });
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await owner(req, false);
    const list = await liveSharesOf(ws.id);
    return json({ links: list.map((r) => ({ token: r.token, url: `${site.url}/r/${r.token}`, createdAt: r.createdAt, expiresAt: r.expiresAt, views: r.views, hasQuestion: Boolean(r.question), preview: r.markdown.slice(0, 90), public: Boolean(r.publicAt) && !r.hiddenAt, publicUrl: r.publicAt && !r.hiddenAt && r.publicSlug ? `${site.url}/answers/${r.publicSlug}` : null, canPublic: Boolean(r.question) })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ answer?: unknown; question?: unknown; includeQuestion?: unknown; consent?: unknown }>(req);
    if (b.consent !== true) throw new HttpError(400, "Confirm that you want to create a public link.", "consent_required");
    const include = b.includeQuestion === true;
    const snap = sanitizeSnapshot({ ...(b.answer && typeof b.answer === "object" ? (b.answer as object) : {}), question: b.question }, include);
    if (typeof snap === "string") throw new HttpError(400, snap, "invalid");
    try {
      const row = await createShare(ws.id, snap);
      return json({ token: row.token, url: `${site.url}/r/${row.token}`, expiresAt: row.expiresAt }, { status: 201 });
    } catch (e) {
      if (e instanceof ShareLimitError) throw new HttpError(429, e.message, "share_limit");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ token?: unknown }>(req);
    if (!validToken(b.token)) throw new HttpError(400, "Unknown link.", "invalid");
    const ok = await revokeShare(ws.id, b.token);
    if (!ok) throw new HttpError(404, "That link doesn't exist or is already revoked.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ token?: unknown; public?: unknown; consent?: unknown; slug?: unknown; takedown?: unknown }>(req);
    if (b.takedown === true) {
      if (!ws.admin) throw new HttpError(403, "Admins only.", "forbidden");
      if (typeof b.slug !== "string" || !(await takeDownPublic(b.slug))) throw new HttpError(404, "No such public page.", "not_found");
      return json({ ok: true });
    }
    if (!validToken(b.token) || typeof b.public !== "boolean") throw new HttpError(400, "Unknown link.", "invalid");
    if (!b.public) {
      if (!(await unpublishShare(ws.id, b.token))) throw new HttpError(404, "That page isn't public.", "not_found");
      return json({ public: false });
    }
    if (!ws.verified) throw new HttpError(403, "Verify your email address before making a page public.", "unverified");
    if (b.consent !== true) throw new HttpError(400, "Confirm that you want this page to be public and indexable.", "consent_required");
    const r = await publishShare(ws.id, b.token);
    if (!r.ok) throw new HttpError(r.code === "not_found" ? 404 : r.code === "limit" ? 429 : r.code === "taken_down" ? 403 : 422, r.message, r.code);
    return json({ public: true, url: `${site.url}/answers/${r.slug}`, title: publicTitle(r.row.question ?? "") });
  } catch (e) {
    return errorResponse(e);
  }
}
