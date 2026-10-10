import { body, errorResponse, json, HttpError } from "@/lib/create/platform/http";
import { connectorsView } from "@/lib/business/visibility";
import { isOAuthConnector, setToolEnabled } from "@/lib/business/oauth-connectors";
import { owner } from "../../_owner";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ connector: string; tool: string; enabled: boolean }>(req);
    if (!isOAuthConnector(b.connector)) throw new HttpError(400, "Unknown connector.");
    await setToolEnabled(ws.id, b.connector, String(b.tool), b.enabled === true);
    return json(await connectorsView(ws.id, ws.admin));
  } catch (e) {
    return errorResponse(e);
  }
}
