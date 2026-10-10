/**
 * Who sees which connector. A connector whose server-side keys are not set is hidden from regular users:
 * no "Not configured" card, no env var names, no redirect URIs. Only admin accounts get those, in a separate
 * "Setup needed" list. Agents that need a hidden connector are simply not offered.
 */
import { listConnections } from "./connectors";
import { PLAID_ENV_NAMES, plaidConfigured, plaidEnv } from "./plaid";
import { STRIPE_BANK_ENV, stripeBanksConfigured, stripeBanksProblem } from "./stripe-banks";
import { isOAuthConnector, oauthConfigured, requiredFor } from "./oauth-connectors";
import { HttpError } from "@/lib/create/platform/http";

type Listed = Awaited<ReturnType<typeof listConnections>>[number];

/** The connector card a regular user sees. Nothing technical about server setup is in this shape. */
export type PublicConnector = Pick<Listed, "id" | "label" | "what" | "tools" | "connection"> & { configured: true };
/** The admin-only "Setup needed" entry. */
export type SetupNeeded = { id: string; label: string; what: string; needsEnv: string[]; setup: string | null; redirectUri: string | null; note: string | null };

const isUsable = (c: Listed) => c.configured || Boolean(c.connection); // an already-connected one stays so it can be turned off or disconnected

export async function connectorsView(workspaceId: string, admin: boolean): Promise<{ connectors: PublicConnector[]; setupNeeded?: SetupNeeded[] }> {
  const all = await listConnections(workspaceId);
  const connectors = all.filter(isUsable).map((c) => ({ id: c.id, label: c.label, what: c.what, tools: c.tools, connection: c.connection, configured: true as const }));
  if (!admin) return { connectors };
  const setupNeeded: SetupNeeded[] = all
    .filter((c) => !isUsable(c))
    .map((c) => ({ id: c.id, label: c.label, what: c.what, needsEnv: c.needsEnv, setup: c.setup, redirectUri: c.redirectUri, note: isOAuthConnector(c.id) ? null : c.live }));
  return { connectors, setupNeeded };
}

export type BankPublic = { configured: boolean; plaid: boolean; stripe: boolean; env: string; stripeEnv: string; pending: number; items: unknown[]; setupNeeded?: SetupNeeded[] };
type BankList = BankPublic & { needsEnv: string[] };

/** Admin-only cards for whichever bank provider still needs keys. */
function bankSetup(): SetupNeeded[] {
  const out: SetupNeeded[] = [];
  if (!plaidConfigured()) out.push({ id: "plaid", label: "Bank accounts · Plaid", what: "Read-only balances and recent transactions.", needsEnv: [...PLAID_ENV_NAMES], setup: `Set PLAID_ENV=sandbox for test banks (currently ${plaidEnv()}).`, redirectUri: null, note: null });
  if (!stripeBanksConfigured()) out.push({ id: "stripe-fc", label: "Bank accounts · Stripe", what: "Read-only balances and recent transactions. US banks. Keplar cannot charge the account.", needsEnv: [...STRIPE_BANK_ENV], setup: stripeBanksProblem(), redirectUri: null, note: null });
  return out;
}

/** Banks: regular users get nothing at all when no bank provider is configured and nothing is linked. */
export function banksView(d: BankList, admin: boolean): { hidden: true; setupNeeded?: SetupNeeded[] } | (BankPublic & { hidden?: false }) {
  const setup = admin ? bankSetup() : [];
  if (!d.configured && d.items.length === 0) return admin ? { hidden: true, setupNeeded: setup } : { hidden: true };
  return { configured: d.configured, plaid: d.plaid, stripe: d.stripe, env: d.env, stripeEnv: d.stripeEnv, pending: d.pending, items: d.items, ...(setup.length ? { setupNeeded: setup } : {}) };
}

/** Whether every connector a workflow template needs is available on this server. Hidden-connector templates are not offered. */
export function templateOffered(template: string): boolean {
  if (template === "social-post") return false; // Social scheduler has no server keys wired; it is never available
  return requiredFor(template).every((n) => !isOAuthConnector(n.connector) || oauthConfigured(n.connector));
}
export const offeredTemplates = (all: string[]): string[] => all.filter(templateOffered);

/** For regular users, a generic message; env var names never leave the server. */
export function hideSetupDetail(e: unknown, admin: boolean): unknown {
  if (!admin && e instanceof HttpError && e.code === "not_configured") return new HttpError(503, "This connection isn't available right now.", "not_available");
  return e;
}
