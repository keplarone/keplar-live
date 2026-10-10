import { body, errorResponse, json } from "@/lib/create/platform/http";
import { listCrm, upsertContact } from "@/lib/business/crm";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json(await listCrm(ws.id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ name?: string; email: string }>(req);
    return json({ contact: await upsertContact(ws.id, { name: b.name, email: b.email ?? "", source: "manual" }) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
