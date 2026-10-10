import { assertSameAccount } from "@/lib/accounts/account-guard";
import { emailConfigured } from "@/lib/accounts/outbox";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { FEATURES, placeable } from "@/lib/site-builder/features/catalog";
import { findPlaceholders } from "@/lib/site-builder/features/placeholders";
import { listRecords, records } from "@/lib/site-builder/features/records";
import { orders } from "@/lib/business/repo";
import { connectProblem, getAccount, inCurrentMode, stripeMode } from "@/lib/business/stripe";
import { getSite, headFiles } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Owner view of a site's features: the catalog with honest status, what is placed on the pages, what visitors sent, and the email choices. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const site = await getSite(ws, (await params).id);
    const files = await headFiles(site);
    const placed: Record<string, number> = {};
    for (const [f, html] of Object.entries(files)) if (f.endsWith(".html")) for (const p of findPlaceholders(html)) placed[p.feature] = (placed[p.feature] ?? 0) + 1;
    const [subs, books, mems] = await Promise.all([listRecords(ws.id, site.id, "newsletter"), listRecords(ws.id, site.id, "booking"), listRecords(ws.id, site.id, "members")]);
    const acct = await getAccount(ws.id);
    const mine = (await orders().list(ws.id, (o) => o.projectId === site.id && inCurrentMode(o))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reason = connectProblem() ? "Stripe isn't configured on this server yet." : !ws.entitlements.commerce ? "Selling needs the Plus plan or higher." : !acct ? "Connect Stripe in Business > Payments." : !acct.chargesEnabled ? "Finish Stripe onboarding in Business > Payments." : null;
    return json({
      payments: { ready: reason === null, reason, mode: stripeMode(), orders: mine.slice(0, 50).map((o) => ({ id: o.id, product: o.productName, amount: o.amount, currency: o.currency, status: o.status, email: o.customerEmail, at: o.createdAt })) },
      catalog: FEATURES.map((f) => ({ id: f.id, label: f.label, status: f.status, summary: f.summary, note: f.note ?? null, prompt: f.prompt, addable: placeable(f), placed: placed[f.id] ?? 0 })),
      settings: { notifyOwner: Boolean(site.featureSettings?.notifyOwner), confirmVisitors: Boolean(site.featureSettings?.confirmVisitors), analytics: site.featureSettings?.analytics !== false, emailDelivery: emailConfigured() },
      leads: site.leadCount,
      subscribers: subs.slice(0, 500).map((r) => ({ id: r.id, table: r.key, email: r.data.email, name: r.data.name ?? "", kind: r.data.kind ?? "newsletter", at: r.createdAt })),
      members: mems.slice(0, 500).map((r) => ({ id: r.id, email: r.data.email, at: r.createdAt })),
      bookings: books.slice(0, 500).map((r) => ({ id: r.id, table: r.key, name: r.data.name, email: r.data.email, note: r.data.note ?? "", start: r.data.start, tz: r.data.tz, status: r.status })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove a signup or cancel a booking (a cancelled slot is free again). */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await currentWorkspace(req);
    assertSameAccount(req, ws.userId);
    await rateLimit(`sb:feat:${ws.id}`, 120, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ id?: string }>(req);
    const row = input.id ? await records().get(ws.id, input.id) : null;
    if (!row || row.siteId !== site.id || (row.feature !== "newsletter" && row.feature !== "booking" && row.feature !== "members")) throw new HttpError(404, "That entry doesn't exist.", "not_found");
    await records().remove(ws.id, row.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
