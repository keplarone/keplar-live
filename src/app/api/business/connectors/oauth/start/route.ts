import { body, errorResponse, json, HttpError } from "@/lib/create/platform/http";
import { authorizeUrl, isOAuthConnector } from "@/lib/business/oauth-connectors";
import { hideSetupDetail } from "@/lib/business/visibility";
import { requireBusinessRole } from "@/lib/business/team";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the provider's sign-in URL (signed state bound to this workspace). 503 "not_configured" until the OAuth app keys exist. */
export async function POST(req: Request) {
  let admin = false;
  try {
    const ws = await owner(req);
    requireBusinessRole(ws, "connect apps");
    admin = ws.admin;
    const b = await body<{ connector: string }>(req);
    if (!isOAuthConnector(b.connector)) throw new HttpError(400, "Unknown connector.");
    return json({ url: authorizeUrl(ws.id, b.connector) });
  } catch (e) {
    return errorResponse(hideSetupDetail(e, admin));
  }
}
