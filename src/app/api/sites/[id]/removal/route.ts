import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { removalImpact } from "@/lib/site-builder/deletion";
import { removalSummary } from "@/lib/site-builder/deletion-copy";
import { getSite } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** What deleting this site would remove and keep (counts from the account's own data), and anything that blocks it. Changes nothing. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const site = await getSite(ws, (await params).id);
    const impact = await removalImpact(site);
    return json({ impact, ...removalSummary(impact) });
  } catch (e) {
    return errorResponse(e);
  }
}
