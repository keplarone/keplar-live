/** Request guard for personal settings routes: signed-in owner of a PERSONAL workspace, same-origin for writes. Each route rate limits its writes. */
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { HttpError } from "@/lib/create/platform/http";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { isSameOrigin } from "@/lib/security/origin";

export async function personalOwner(req: Request, write = false): Promise<Workspace> {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req); // personal workspace only; 401 when signed out
  if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to save personal settings.", "unauthenticated");
  assertSameAccount(req, ws.userId);
  return ws;
}
