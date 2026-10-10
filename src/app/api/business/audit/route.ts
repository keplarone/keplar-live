import { errorResponse, json } from "@/lib/create/platform/http";
import { auditLog } from "@/lib/business/repo";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json({ entries: (await auditLog().list(ws.id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200) });
  } catch (e) {
    return errorResponse(e);
  }
}
