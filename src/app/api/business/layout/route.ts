import { assertSameOrigin } from "@/lib/security/origin";
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { requireBusiness } from "@/lib/business/require";
import { getLayout, saveLayout } from "@/lib/business/workspace-data";

export const runtime = "nodejs";

/** The person's Business dashboard layout: widget order and sizes. */
export async function GET(req: Request) {
  try {
    const ws = await requireBusiness(req);
    return json({ items: await getLayout(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const b = await body<{ items?: unknown }>(req);
    return json({ items: await saveLayout(ws.id, b.items) });
  } catch (e) {
    return errorResponse(e);
  }
}
