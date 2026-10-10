/**
 * Bank connections via Stripe Financial Connections. Read-only: balances and transactions.
 * The session never requests `payment_method` or `ownership`, so a linked bank cannot be charged
 * and Keplar does not pull account-holder identity. US institutions only; manual account entry is off.
 *
 * Configured only when STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are both set and both match
 * KEPLAR_STRIPE_MODE. The Connect webhook secret is not required. Prefer a restricted key (rk_).
 * The publishable key is the only Stripe value that goes to the browser. Session ids and the
 * Stripe customer id are sealed with the workspace-bound key.
 */
import type Stripe from "stripe";
import { id, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { stripe as stripeClient } from "@/lib/billing/stripe";
import { openSecret, scrub, sealSecret, secretsAvailable } from "@/lib/mcp/crypto";
import { audit, bankItems, type BankItem } from "./repo";
import { stripeKeyMode, stripeMode } from "./stripe";
import type { BankAccount, BankTxn, BankView } from "./plaid";

export const STRIPE_BANK_ENV = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"] as const;
const READ_ONLY = ["balances", "transactions"] as const;

export type StripePublishableMode = "test" | "live" | "unknown" | null;
export function stripePublishableMode(): StripePublishableMode {
  const k = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!k) return null;
  if (k.startsWith("pk_test_")) return "test";
  if (k.startsWith("pk_live_")) return "live";
  return "unknown";
}

/** Why bank linking is off, in words for an admin. Null when the keys match the mode. */
export function stripeBanksProblem(): string | null {
  const mode = stripeMode();
  const missing = STRIPE_BANK_ENV.filter((n) => !process.env[n]?.trim());
  if (missing.length) return `Add ${missing.join(" and ")} (KEPLAR_STRIPE_MODE=${mode}). Use a restricted key (rk_${mode}_) for STRIPE_SECRET_KEY and a publishable key (pk_${mode}_). Turn on Financial Connections in the Stripe Dashboard for ${mode} mode.`;
  const key = stripeKeyMode();
  const pk = stripePublishableMode();
  if (key === "unknown") return "STRIPE_SECRET_KEY must be a Stripe restricted or secret key (rk_ or sk_, then test_ or live_).";
  if (pk === "unknown") return "STRIPE_PUBLISHABLE_KEY must start with pk_test_ or pk_live_.";
  if (key !== mode || pk !== mode) return `KEPLAR_STRIPE_MODE=${mode}, but the secret key is ${key} and the publishable key is ${pk}. They have to match. Bank linking stays off.`;
  return null;
}

export const stripeBanksConfigured = () => stripeBanksProblem() === null;

function stripeMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Stripe didn't answer.";
  const cleaned = scrub(scrub(msg, process.env.STRIPE_SECRET_KEY?.trim()), process.env.STRIPE_PUBLISHABLE_KEY?.trim());
  return `Stripe: ${cleaned.slice(0, 180)}`;
}
function fail(e: unknown): never {
  throw new HttpError(502, stripeMessage(e), "provider_error");
}

function need(): Stripe {
  const problem = stripeBanksProblem();
  if (problem) throw new HttpError(503, `Bank connections aren't configured. ${problem}`, "not_configured");
  if (!secretsAvailable()) throw new HttpError(503, "Secure storage isn't configured on this server.", "not_configured");
  const s = stripeClient();
  if (!s) throw new HttpError(503, "Bank connections aren't configured.", "not_configured");
  return s;
}

type Saved = { customerId: string; accountIds: string[] };
function readSaved(row: BankItem, workspaceId: string): Saved | null {
  const raw = openSecret(row.accessEnc, workspaceId, row.id);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { customerId?: unknown; accountIds?: unknown };
    if (typeof j.customerId !== "string" || !j.customerId.startsWith("cus_")) return null;
    const accountIds = Array.isArray(j.accountIds) ? j.accountIds.filter((x): x is string => typeof x === "string" && x.startsWith("fca_")) : [];
    return { customerId: j.customerId, accountIds };
  } catch {
    return null;
  }
}

async function existingCustomer(workspaceId: string): Promise<string | null> {
  for (const row of await bankItems().list(workspaceId, (b) => b.provider === "stripe")) {
    const saved = readSaved(row, workspaceId);
    if (saved) return saved.customerId;
  }
  return null;
}

function holderCustomer(session: Stripe.FinancialConnections.Session): string | null {
  const c = session.account_holder?.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

function readOnly(perms: readonly string[]): boolean {
  return perms.length > 0 && perms.every((p) => p === "balances" || p === "transactions");
}

/** First currency in a Stripe cents map, converted to major units. Positive means money the holder has. */
function firstMoney(map: { [key: string]: number } | null | undefined): { amount: number; currency: string } | null {
  if (!map) return null;
  for (const [cur, cents] of Object.entries(map)) {
    if (typeof cents === "number" && /^[a-z]{3}$/.test(cur)) return { amount: cents / 100, currency: cur.toUpperCase() };
  }
  return null;
}

const card = (row: BankItem): BankView => ({ id: row.id, provider: row.provider, status: row.status, institution: row.institution, connectedAt: row.connectedAt, accounts: [], transactions: [], note: null });

/** Step 1: a Financial Connections session. The browser opens it with Stripe.js. */
export async function startStripeBank(workspaceId: string): Promise<{ clientSecret: string; publishableKey: string; sessionId: string }> {
  const s = need();
  const pk = process.env.STRIPE_PUBLISHABLE_KEY!.trim();
  let customerId = await existingCustomer(workspaceId);
  if (!customerId) {
    const customer = await s.customers.create({ metadata: { workspaceId, purpose: "financial_connections" } }, { idempotencyKey: `keplar-fc-customer-${workspaceId}` }).catch(fail);
    customerId = customer.id;
  }
  const rowId = id("bank");
  const session = await s.financialConnections.sessions.create({
    account_holder: { type: "customer", customer: customerId },
    permissions: [...READ_ONLY],
    prefetch: [...READ_ONLY],
    filters: { countries: ["US"] },
    manual_entry: { mode: "disabled" },
  }, { idempotencyKey: `keplar-fc-session-${rowId}` }).catch(fail);
  if (!session.client_secret) throw new HttpError(502, "Stripe didn't return a bank sign-in.", "provider_error");
  if (!readOnly(session.permissions)) throw new HttpError(502, "Stripe offered more access than balances and transactions. Nothing was saved.", "provider_error");
  await bankItems().insert({
    id: rowId,
    workspaceId,
    provider: "stripe",
    status: "pending",
    institution: "",
    linkTokenEnc: sealSecret(session.id, workspaceId, rowId),
    accessEnc: sealSecret(JSON.stringify({ customerId, accountIds: [] } satisfies Saved), workspaceId, rowId),
    connectedAt: null,
    createdAt: now(),
  });
  await audit(workspaceId, "owner", "bank.link_started", rowId, "stripe");
  return { clientSecret: session.client_secret, publishableKey: pk, sessionId: session.id };
}

/**
 * Step 2: the picker finished (or the owner pressed Check again). Only a session id sealed on a
 * pending row in this workspace is retrieved. A session that asked to charge, or from the other mode, is refused.
 */
export async function completeStripeBanks(workspaceId: string, sessionId?: string): Promise<{ connected: number; waiting: number }> {
  const s = need();
  const pending = await bankItems().list(workspaceId, (b) => b.provider === "stripe" && b.status === "pending");
  const rows = sessionId ? pending.filter((r) => openSecret(r.linkTokenEnc, workspaceId, r.id) === sessionId) : pending;
  if (sessionId && rows.length === 0) throw new HttpError(404, "That bank session isn't waiting.");
  let connected = 0;
  let waiting = 0;
  for (const row of rows) {
    const sid = openSecret(row.linkTokenEnc, workspaceId, row.id);
    const saved = readSaved(row, workspaceId);
    if (!sid || !saved) {
      await bankItems().update(workspaceId, row.id, { status: "error" });
      continue;
    }
    if (!sessionId && Date.now() - Date.parse(row.createdAt) > 864e5) {
      await bankItems().remove(workspaceId, row.id);
      continue;
    }
    const session = await s.financialConnections.sessions.retrieve(sid).catch(fail);
    if (holderCustomer(session) !== saved.customerId) {
      await bankItems().update(workspaceId, row.id, { status: "error" });
      throw new HttpError(409, "That bank session belongs to a different customer.", "conflict");
    }
    if (Boolean(session.livemode) !== (stripeMode() === "live")) {
      await bankItems().update(workspaceId, row.id, { status: "error" });
      throw new HttpError(409, "That bank session is from a different Stripe mode.", "conflict");
    }
    if (!readOnly(session.permissions)) {
      await bankItems().update(workspaceId, row.id, { status: "error" });
      throw new HttpError(400, "This bank link asked for more than balances and transactions. It was not saved.", "bad_request");
    }
    const accounts = session.accounts?.data ?? [];
    if (accounts.length === 0) {
      waiting++;
      continue;
    }
    const institution = accounts[0]?.institution_name || "Bank";
    await bankItems().update(workspaceId, row.id, {
      status: "connected",
      institution,
      accessEnc: sealSecret(JSON.stringify({ customerId: saved.customerId, accountIds: accounts.map((a) => a.id) } satisfies Saved), workspaceId, row.id),
      linkTokenEnc: null,
      connectedAt: now(),
    });
    await audit(workspaceId, "owner", "bank.connected", row.id, institution);
    connected++;
  }
  return { connected, waiting };
}

export async function viewStripeBank(workspaceId: string, row: BankItem): Promise<BankView> {
  const out = card(row);
  const saved = readSaved(row, workspaceId);
  if (!saved || saved.accountIds.length === 0) return { ...out, note: "Reconnect this bank: its saved access can't be opened." };
  if (!stripeBanksConfigured() || !stripeClient()) return { ...out, note: "Stripe isn't configured on this server, so balances can't be loaded." };
  const s = stripeClient()!;
  const txns: BankTxn[] = [];
  let txNote: string | null = null;
  for (const accountId of saved.accountIds) {
    let account: Stripe.FinancialConnections.Account;
    try {
      account = await s.financialConnections.accounts.retrieve(accountId);
    } catch (e) {
      out.note = stripeMessage(e);
      continue;
    }
    const current = firstMoney(account.balance?.current);
    const available = firstMoney(account.balance?.cash?.available) ?? current;
    const shown: BankAccount = {
      id: account.id,
      name: account.display_name || account.subcategory || "Account",
      mask: account.last4,
      type: account.category,
      subtype: account.subcategory,
      available: available?.amount ?? null,
      current: current?.amount ?? null,
      currency: (available ?? current)?.currency ?? "USD",
    };
    out.accounts.push(shown);
    try {
      const list = await s.financialConnections.transactions.list({ account: accountId, limit: 25 });
      for (const t of list.data) {
        txns.push({
          id: t.id,
          account: accountId,
          name: t.description || "Transaction",
          // Stripe: positive cents move into the account, negative cents move out.
          amount: t.amount / 100,
          currency: t.currency.toUpperCase(),
          date: new Date(t.transacted_at * 1000).toISOString().slice(0, 10),
          pending: t.status === "pending",
        });
      }
    } catch {
      txNote = "Balances loaded; transactions weren't available.";
    }
  }
  out.transactions = txns.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 25);
  if (!out.note) out.note = txNote;
  return out;
}

/** Disconnect each linked account at Stripe (best effort), then delete our copy. */
export async function removeStripeBank(workspaceId: string, row: BankItem): Promise<boolean> {
  const saved = readSaved(row, workspaceId);
  const s = stripeClient();
  if (s && saved) {
    for (const accountId of saved.accountIds) await s.financialConnections.accounts.disconnect(accountId).catch(() => undefined);
  }
  await bankItems().remove(workspaceId, row.id);
  await audit(workspaceId, "owner", "bank.disconnected", row.id);
  return true;
}
