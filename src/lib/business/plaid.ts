/**
 * Bank connections via Plaid Hosted Link (BETA). "Not configured" until PLAID_CLIENT_ID and PLAID_SECRET are set on the server
 * (PLAID_ENV = sandbox | production, default sandbox). Plaid hosts the whole bank-picker, so no Plaid script runs in Keplar
 * and the Content-Security-Policy is unchanged. Access tokens are encrypted with the workspace-bound key and never leave the
 * server. Read-only: balances and recent transactions. Nothing here can move money.
 */
import { id, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { openSecret, scrub, sealSecret, secretsAvailable } from "@/lib/mcp/crypto";
import { siteUrl } from "@/lib/site";
import { audit, bankItems, type BankItem } from "./repo";
import { removeStripeBank, stripeBanksConfigured, viewStripeBank } from "./stripe-banks";
import { stripeMode } from "./stripe";

const fx = (): typeof fetch => globalThis.fetch;
export const plaidEnv = (): "sandbox" | "production" => (process.env.PLAID_ENV?.trim() === "production" ? "production" : "sandbox");
const base = () => `https://${plaidEnv()}.plaid.com`;
export const plaidConfigured = () => Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
export const PLAID_ENV_NAMES = ["PLAID_CLIENT_ID", "PLAID_SECRET"] as const;
const origin = () => (process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "");

async function plaid<T = Record<string, unknown>>(path: string, payload: Record<string, unknown>): Promise<T> {
  const secret = process.env.PLAID_SECRET!.trim();
  const res = await fx()(`${base()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID!.trim(), secret, ...payload }) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof j.error_code === "string" ? j.error_code : `HTTP_${res.status}`;
    const msg = typeof j.error_message === "string" ? j.error_message : "Plaid refused the request.";
    throw Object.assign(new HttpError(502, `Plaid: ${scrub(msg, secret).slice(0, 160)}`, "provider_error"), { plaidCode: code });
  }
  return j as T;
}
const need = () => {
  if (!plaidConfigured()) throw new HttpError(503, `Bank connections aren't configured. Add ${PLAID_ENV_NAMES.join(" and ")} to the server environment.`, "not_configured");
  if (!secretsAvailable()) throw new HttpError(503, "Secure storage isn't configured on this server.", "not_configured");
};

export const publicItem = (b: BankItem) => ({ id: b.id, provider: b.provider, status: b.status, institution: b.institution, connectedAt: b.connectedAt });

/** Step 1: a Plaid-hosted page where the owner picks a bank. Returns the URL to send the browser to. */
export async function startLink(workspaceId: string): Promise<{ url: string; itemId: string }> {
  need();
  const j = await plaid<{ link_token: string; hosted_link_url?: string }>("/link/token/create", {
    client_name: "Keplar",
    user: { client_user_id: workspaceId },
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    hosted_link: { completion_redirect_uri: `${origin()}/app?mcp_oauth=bank_done` },
  });
  if (!j.link_token || !j.hosted_link_url) throw new HttpError(502, "Plaid didn't return a sign-in page. Hosted Link may not be enabled for this Plaid account.", "provider_error");
  const rowId = id("bank");
  await bankItems().insert({ id: rowId, workspaceId, provider: "plaid", status: "pending", institution: "", linkTokenEnc: sealSecret(j.link_token, workspaceId, rowId), accessEnc: null, connectedAt: null, createdAt: now() });
  await audit(workspaceId, "owner", "bank.link_started", rowId);
  return { url: j.hosted_link_url, itemId: rowId };
}

/** Step 2 (after the browser returns): collect the finished session's public token, exchange it, store the access token encrypted. */
export async function completeLinks(workspaceId: string): Promise<{ connected: number; waiting: number }> {
  need();
  let connected = 0;
  let waiting = 0;
  for (const row of await bankItems().list(workspaceId, (b) => b.status === "pending" && b.provider === "plaid")) {
    const linkToken = openSecret(row.linkTokenEnc, workspaceId, row.id);
    if (!linkToken) { await bankItems().update(workspaceId, row.id, { status: "error" }); continue; }
    const g = await plaid<{ link_sessions?: { finished_at?: string | null; results?: { item_add_results?: { public_token?: string; institution?: { name?: string } }[] } }[] }>("/link/token/get", { link_token: linkToken });
    const done = (g.link_sessions ?? []).find((s) => s.results?.item_add_results?.some((r) => r.public_token));
    const hit = done?.results?.item_add_results?.find((r) => r.public_token);
    if (!hit?.public_token) {
      // Older than a day and still nothing: the owner abandoned it.
      if (Date.now() - Date.parse(row.createdAt) > 864e5) await bankItems().remove(workspaceId, row.id);
      else waiting++;
      continue;
    }
    const ex = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: hit.public_token });
    await bankItems().update(workspaceId, row.id, { status: "connected", institution: hit.institution?.name ?? "Bank", accessEnc: sealSecret(ex.access_token, workspaceId, row.id), linkTokenEnc: null, connectedAt: now() });
    await audit(workspaceId, "owner", "bank.connected", row.id, hit.institution?.name ?? "Bank");
    connected++;
  }
  return { connected, waiting };
}

export type BankAccount = { id: string; name: string; mask: string | null; type: string; subtype: string | null; available: number | null; current: number | null; currency: string };
export type BankTxn = { id: string; account: string; name: string; amount: number; currency: string; date: string; pending: boolean };
export type BankView = ReturnType<typeof publicItem> & { accounts: BankAccount[]; transactions: BankTxn[]; note: string | null };

/** Live, read-only view of one connected bank. Plaid amounts are positive for money OUT; we flip the sign so + is money in. */
export async function viewItem(workspaceId: string, row: BankItem): Promise<BankView> {
  if (row.provider === "stripe") return viewStripeBank(workspaceId, row);
  const out: BankView = { ...publicItem(row), accounts: [], transactions: [], note: null };
  const token = openSecret(row.accessEnc, workspaceId, row.id);
  if (!token) return { ...out, note: "Reconnect this bank: its saved access can't be opened." };
  try {
    const b = await plaid<{ accounts?: { account_id: string; name: string; mask?: string | null; type: string; subtype?: string | null; balances: { available: number | null; current: number | null; iso_currency_code?: string | null } }[] }>("/accounts/balance/get", { access_token: token });
    out.accounts = (b.accounts ?? []).map((a) => ({ id: a.account_id, name: a.name, mask: a.mask ?? null, type: a.type, subtype: a.subtype ?? null, available: a.balances.available, current: a.balances.current, currency: a.balances.iso_currency_code ?? "USD" }));
  } catch (e) {
    return { ...out, note: e instanceof Error ? e.message : "Plaid didn't answer." };
  }
  try {
    const t = await plaid<{ added?: { transaction_id: string; account_id: string; name: string; amount: number; iso_currency_code?: string | null; date: string; pending: boolean }[] }>("/transactions/sync", { access_token: token, count: 50 });
    out.transactions = (t.added ?? []).sort((a, z) => z.date.localeCompare(a.date)).slice(0, 25).map((x) => ({ id: x.transaction_id, account: x.account_id, name: x.name, amount: -x.amount, currency: x.iso_currency_code ?? "USD", date: x.date, pending: x.pending }));
  } catch (e) {
    const code = (e as { plaidCode?: string }).plaidCode;
    out.note = code === "PRODUCT_NOT_READY" ? "Plaid is still loading this bank's transactions. Check again in a few minutes." : "Balances loaded; transactions weren't available.";
  }
  return out;
}

export async function listBanks(workspaceId: string, withData: boolean) {
  const rows = await bankItems().list(workspaceId);
  const connected = rows.filter((r) => r.status === "connected");
  const items = await Promise.all(connected.map(async (r) => {
    const empty = { ...publicItem(r), accounts: [] as BankAccount[], transactions: [] as BankTxn[], note: null as string | null };
    if (!withData) return empty;
    // A Plaid row with no Plaid keys stays a name-only card. Stripe rows explain themselves.
    if (r.provider === "plaid" && !plaidConfigured()) return empty;
    return viewItem(workspaceId, r);
  }));
  const plaid = plaidConfigured();
  const stripe = stripeBanksConfigured();
  return { configured: plaid || stripe, plaid, stripe, env: plaidEnv(), stripeEnv: stripeMode(), needsEnv: plaid ? [] : [...PLAID_ENV_NAMES], pending: rows.filter((r) => r.status === "pending").length, items };
}

/** Disconnect: tell Plaid to drop the Item (best effort), then delete our copy of the token. */
export async function removeBank(workspaceId: string, itemId: string): Promise<boolean> {
  const row = await bankItems().get(workspaceId, itemId);
  if (!row) return false;
  if (row.provider === "stripe") return removeStripeBank(workspaceId, row);
  const token = openSecret(row.accessEnc, workspaceId, row.id);
  if (token && plaidConfigured()) await plaid("/item/remove", { access_token: token }).catch(() => undefined);
  await bankItems().remove(workspaceId, itemId);
  await audit(workspaceId, "owner", "bank.disconnected", itemId);
  return true;
}
