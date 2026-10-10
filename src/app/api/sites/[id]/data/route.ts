import { assertSameAccount } from "@/lib/accounts/account-guard";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { addRow, collectionsIn, deleteRow, listRows, seedCollections, updateRow } from "@/lib/site-builder/features/data";
import { getSite, headFiles } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Owner-only. The public can read a published table as JSON (/s/<slug>/_data/<table>.json) but can never write. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const site = await getSite(ws, (await params).id);
    const files = await headFiles(site);
    await seedCollections(site, files);
    const tables = [];
    for (const c of collectionsIn(files)) {
      const rows = await listRows(site, c.key);
      tables.push({ key: c.key, title: c.title, columns: c.fields, rows: rows.map((r) => ({ id: r.id, ...Object.fromEntries(c.fields.map((f) => [f, r.data[f] ?? ""])) })), publicUrl: site.publishedVersion !== null ? `/s/${site.slug}/_data/${c.key}.json` : null });
    }
    return json({ tables });
  } catch (e) {
    return errorResponse(e);
  }
}

async function owner(req: Request, params: Ctx["params"]) {
  assertSameOrigin(req);
  const ws = await currentWorkspace(req);
  assertSameAccount(req, ws.userId);
  await rateLimit(`sb:data:${ws.id}`, 120, 60, { shared: true });
  const site = await getSite(ws, (await params).id);
  return { site, files: await headFiles(site) };
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { site, files } = await owner(req, params);
    const input = await body<{ table?: string; row?: Record<string, unknown> }>(req);
    if (!input.table || !input.row || typeof input.row !== "object") throw new HttpError(400, "Which table and row?");
    const row = await addRow(site, files, input.table, input.row);
    return json({ id: row.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { site, files } = await owner(req, params);
    const input = await body<{ table?: string; id?: string; row?: Record<string, unknown> }>(req);
    if (!input.table || !input.id || !input.row || typeof input.row !== "object") throw new HttpError(400, "Which row?");
    await updateRow(site, files, input.table, input.id, input.row);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { site } = await owner(req, params);
    const input = await body<{ table?: string; id?: string }>(req);
    if (!input.table || !input.id) throw new HttpError(400, "Which row?");
    await deleteRow(site, input.table, input.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
