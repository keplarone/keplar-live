import { domainStatus, removeDomain, verifyDomain } from "@/lib/domains/service";
import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Status poll. Re-checks DNS at most every ~20 s while the domain isn't active yet. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    return json({ domain: await domainStatus(ws, (await params).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** "Check again": always re-checks now, bypassing our throttle and caches (fresh DNS from Google and Cloudflare, fresh Vercel config). Still rate limited per account. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    return json({ domain: await verifyDomain(ws, (await params).id, { force: true }) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    await removeDomain(ws, (await params).id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
