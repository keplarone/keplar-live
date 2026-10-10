import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { listCreds, removeCred, saveApple, saveExpo, saveGoogle } from "@/lib/mobile/credentials";
import { STORE_FACTS } from "@/lib/mobile/facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statuses only. Secrets are write-only: no endpoint returns them. */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    return json({ credentials: await listCreds(ws.id), facts: STORE_FACTS });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`mobile:cred:${ws.id}`, 12, 60, { shared: true });
    const b = await body<{ kind: string; issuerId?: string; keyId?: string; privateKey?: string; serviceAccountJson?: string; packageName?: string; token?: string }>(req);
    if (b.kind === "apple") await saveApple(ws.id, b);
    else if (b.kind === "google") await saveGoogle(ws.id, b);
    else if (b.kind === "expo") await saveExpo(ws.id, String(b.token ?? ""));
    else throw new HttpError(400, "Unknown credential type.");
    return json({ credentials: await listCreds(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const b = await body<{ kind: string }>(req);
    if (b.kind !== "apple" && b.kind !== "google" && b.kind !== "expo") throw new HttpError(400, "Unknown credential type.");
    await removeCred(ws.id, b.kind);
    return json({ credentials: await listCreds(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
