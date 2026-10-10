import { body, errorResponse, json } from "@/lib/create/platform/http";
import { setHalted } from "@/lib/business/agents";
import { owner } from "../../_owner";

export const runtime = "nodejs";
/** Workspace-wide kill switch. */
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ halted: boolean }>(req);
    await setHalted(ws, Boolean(b.halted));
    return json({ halted: Boolean(b.halted) });
  } catch (e) {
    return errorResponse(e);
  }
}
