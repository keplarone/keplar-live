/** Shared request guard for /api/projects/**: signed-in owner only, same-origin for writes, per-account write limit. */
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { HttpError } from "@/lib/create/platform/http";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { isSameOrigin } from "@/lib/security/origin";
import { minuteLimit } from "@/lib/tools/access";

export async function projectOwner(req: Request, write = false): Promise<Workspace> {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req, { team: true }); // 401 when signed out: saved projects need an account
  assertSameAccount(req, ws.userId);
  if (write) await minuteLimit(`projects:${ws.id}:write`, 60);
  return ws;
}

export const confirmed = (v: unknown) => v === "DELETE";
