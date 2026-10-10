import { meter } from "@/lib/create/platform/compute";
import { createReady, USER_CONTENT_DOMAIN } from "@/lib/create/platform/config";
import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ws = (await currentWorkspace(req));
    return json({
      workspace: { id: ws.id, plan: ws.plan, verified: ws.verified },
      entitlements: { ...ws.entitlements, monthlyUnits: Number.isFinite(ws.entitlements.monthlyUnits) ? ws.entitlements.monthlyUnits : null },
      compute: await meter(ws),
      userContentDomain: USER_CONTENT_DOMAIN,
      ready: createReady(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
