import { body, errorResponse, json } from "@/lib/create/platform/http";
import { connect, disconnect } from "@/lib/business/connectors";
import { connectorsView } from "@/lib/business/visibility";
import type { ConnectorId } from "@/lib/business/types";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json(await connectorsView(ws.id, ws.admin));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ connector: ConnectorId; action: "connect" | "disconnect" }>(req);
    if (b.action === "disconnect") await disconnect(ws.id, b.connector);
    else await connect(ws.id, b.connector);
    return json(await connectorsView(ws.id, ws.admin));
  } catch (e) {
    return errorResponse(e);
  }
}
