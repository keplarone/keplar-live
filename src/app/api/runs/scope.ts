import { HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { businessWorkspace } from "@/lib/business/require";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import type { LedgerScope } from "@/lib/runs/ledger";

/** The signed-in person's ledger scope. Signed-out visitors own no work, so they get a 401 rather than an empty list. */
export async function ledgerScope(req: Request): Promise<LedgerScope> {
  const ws = await currentWorkspace(req);
  if (ws.anonymous) throw new HttpError(401, "Sign in to see your tasks.", "signed_out");
  await limitRequest(req, "runs", { perIp: 600, perAccount: 600, accountId: ws.id, windowSec: 3600 });
  const biz = await businessWorkspace(req);
  return { personal: ws.id, business: biz.business ? biz.ws.id : null };
}
