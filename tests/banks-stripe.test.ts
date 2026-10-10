import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { setStripeClientForTests } from "../src/lib/billing/stripe";
import { bankItems } from "../src/lib/business/repo";
import { completeLinks, listBanks, removeBank } from "../src/lib/business/plaid";
import { completeStripeBanks, startStripeBank, stripeBanksConfigured } from "../src/lib/business/stripe-banks";
import { banksView } from "../src/lib/business/visibility";
import { testWorkspace } from "./helpers/workspace";
import { sealSecret } from "../src/lib/mcp/crypto";
import { id, now } from "../src/lib/create/platform/ids";

const saved = {
  sk: process.env.STRIPE_SECRET_KEY,
  pk: process.env.STRIPE_PUBLISHABLE_KEY,
  mode: process.env.KEPLAR_STRIPE_MODE,
  plaidId: process.env.PLAID_CLIENT_ID,
  plaidSecret: process.env.PLAID_SECRET,
};
function put(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
afterEach(() => {
  setStripeClientForTests(null);
  globalThis.fetch = realFetch;
  put("STRIPE_SECRET_KEY", saved.sk);
  put("STRIPE_PUBLISHABLE_KEY", saved.pk);
  put("KEPLAR_STRIPE_MODE", saved.mode);
  put("PLAID_CLIENT_ID", saved.plaidId);
  put("PLAID_SECRET", saved.plaidSecret);
});

const realFetch = globalThis.fetch;
const keys = () => {
  process.env.STRIPE_SECRET_KEY = "rk_test_restricted";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_publishable";
  process.env.KEPLAR_STRIPE_MODE = "test";
};

type Sess = {
  id: string;
  client_secret: string;
  livemode: boolean;
  permissions: string[];
  account_holder: { type: "customer"; customer: string };
  accounts: { data: { id: string; institution_name: string; display_name: string }[] };
};
function fake() {
  const calls: { op: string; args: unknown[] }[] = [];
  const sessions = new Map<string, Sess>();
  const api = {
    customers: {
      create: async () => {
        calls.push({ op: "customer", args: [] });
        return { id: "cus_test_1" };
      },
    },
    financialConnections: {
      sessions: {
        create: async (params: { permissions: string[]; prefetch?: string[]; filters?: { countries?: string[] }; manual_entry?: { mode?: string }; account_holder: { customer: string }; payment_method_types?: unknown }) => {
          calls.push({ op: "session", args: [params] });
          const s: Sess = {
            id: `fcsess_${sessions.size + 1}`,
            client_secret: `fcsess_secret_${sessions.size + 1}`,
            livemode: false,
            permissions: [...params.permissions],
            account_holder: { type: "customer", customer: params.account_holder.customer },
            accounts: { data: [] },
          };
          sessions.set(s.id, s);
          return s;
        },
        retrieve: async (sid: string) => {
          calls.push({ op: "retrieve", args: [sid] });
          const s = sessions.get(sid);
          if (!s) throw new Error(`missing ${process.env.STRIPE_SECRET_KEY}`);
          return s;
        },
      },
      accounts: {
        retrieve: async (accountId: string) => {
          calls.push({ op: "account", args: [accountId] });
          if (accountId === "fca_boom") throw new Error(`nope ${process.env.STRIPE_SECRET_KEY}`);
          return {
            id: accountId,
            display_name: "Checking",
            last4: "6789",
            category: "cash",
            subcategory: "checking",
            institution_name: "Test Institution",
            balance: { as_of: 1, type: "cash", current: { usd: 25050 }, cash: { available: { usd: 24000 } } },
          };
        },
        disconnect: async (accountId: string) => {
          calls.push({ op: "disconnect", args: [accountId] });
          return { id: accountId };
        },
      },
      transactions: {
        list: async (params: { account: string }) => {
          calls.push({ op: "txns", args: [params] });
          return {
            data: [
              { id: "fctxn_coffee", account: params.account, amount: -450, currency: "usd", description: "Coffee", status: "posted", transacted_at: 1760000000 },
              { id: "fctxn_pay", account: params.account, amount: 200000, currency: "usd", description: "Payroll", status: "posted", transacted_at: 1760001000 },
            ],
          };
        },
      },
    },
  };
  return { api, calls, sessions };
}

test("stripe banks: off until both keys match the mode, and the error names the env vars", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.KEPLAR_STRIPE_MODE;
  assert.equal(stripeBanksConfigured(), false);
  const ws = await testWorkspace("fc-off");
  await assert.rejects(startStripeBank(ws.id), (e: { code?: string; message: string }) => e.code === "not_configured" && /STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY/.test(e.message));
  process.env.STRIPE_SECRET_KEY = "rk_live_restricted";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_publishable";
  process.env.KEPLAR_STRIPE_MODE = "test";
  assert.equal(stripeBanksConfigured(), false, "a live secret with a test publishable key stays off");
});

test("stripe banks: read-only session, balances and transactions, reused customer, disconnect", async () => {
  keys();
  const { api, calls, sessions } = fake();
  setStripeClientForTests(api);
  const ws = await testWorkspace("fc-flow");
  const started = await startStripeBank(ws.id);
  assert.equal(started.publishableKey, "pk_test_publishable");
  assert.match(started.sessionId, /^fcsess_/);
  const params = calls.find((c) => c.op === "session")!.args[0] as { permissions: string[]; prefetch: string[]; filters: { countries: string[] }; manual_entry: { mode: string }; payment_method_types?: unknown };
  assert.deepEqual(params.permissions, ["balances", "transactions"]);
  assert.deepEqual(params.prefetch, ["balances", "transactions"]);
  assert.deepEqual(params.filters.countries, ["US"]);
  assert.equal(params.manual_entry.mode, "disabled");
  assert.equal(params.payment_method_types, undefined);
  assert.equal(JSON.stringify(started).includes("rk_test_restricted"), false);

  assert.deepEqual(await completeStripeBanks(ws.id, started.sessionId), { connected: 0, waiting: 1 });
  sessions.get(started.sessionId)!.accounts.data.push({ id: "fca_1", institution_name: "Test Institution", display_name: "Checking" });
  assert.deepEqual(await completeStripeBanks(ws.id, started.sessionId), { connected: 1, waiting: 0 });

  const row = (await bankItems().list(ws.id)).find((r) => r.status === "connected")!;
  assert.equal(row.provider, "stripe");
  assert.ok(row.accessEnc && !row.accessEnc.includes("cus_test") && !row.accessEnc.includes("fca_1"));
  assert.equal(row.linkTokenEnc, null);

  const view = await listBanks(ws.id, true);
  assert.equal(view.stripe, true);
  assert.equal(view.items[0].institution, "Test Institution");
  assert.equal(view.items[0].accounts[0].available, 240);
  assert.equal(view.items[0].accounts[0].current, 250.5);
  assert.equal(view.items[0].accounts[0].mask, "6789");
  assert.deepEqual(view.items[0].transactions.map((t) => [t.name, t.amount]), [["Payroll", 2000], ["Coffee", -4.5]]);
  assert.equal(JSON.stringify(view).includes("fcsess_secret"), false);
  assert.equal(JSON.stringify(view).includes("rk_test_restricted"), false);

  const customers = calls.filter((c) => c.op === "customer").length;
  await startStripeBank(ws.id);
  assert.equal(calls.filter((c) => c.op === "customer").length, customers, "the workspace keeps one Stripe customer");

  await assert.rejects(completeStripeBanks(ws.id, "fcsess_other_workspace"), (e: { status?: number }) => e.status === 404);

  assert.equal(await removeBank(ws.id, row.id), true);
  assert.ok(calls.some((c) => c.op === "disconnect" && c.args[0] === "fca_1"));
  assert.equal((await bankItems().list(ws.id)).some((r) => r.id === row.id), false);
});

test("stripe banks: a session that asks to charge is not saved", async () => {
  keys();
  const { api, sessions } = fake();
  setStripeClientForTests(api);
  const ws = await testWorkspace("fc-charge");
  const started = await startStripeBank(ws.id);
  const session = sessions.get(started.sessionId)!;
  session.permissions = ["balances", "transactions", "payment_method"];
  session.accounts.data.push({ id: "fca_1", institution_name: "Test Institution", display_name: "Checking" });
  await assert.rejects(completeStripeBanks(ws.id, started.sessionId), (e: { status?: number; message: string }) => e.status === 400 && /charge|balances and transactions/.test(e.message));
  assert.equal((await bankItems().list(ws.id))[0].status, "error");
});

test("stripe banks: a live session is refused while the server is in test mode", async () => {
  keys();
  const { api, sessions } = fake();
  setStripeClientForTests(api);
  const ws = await testWorkspace("fc-mode");
  const started = await startStripeBank(ws.id);
  const session = sessions.get(started.sessionId)!;
  session.livemode = true;
  session.accounts.data.push({ id: "fca_1", institution_name: "Test Institution", display_name: "Checking" });
  await assert.rejects(completeStripeBanks(ws.id, started.sessionId), (e: { status?: number }) => e.status === 409);
  assert.equal((await bankItems().list(ws.id))[0].status, "error");
});

test("stripe banks: provider errors never echo the secret key", async () => {
  keys();
  const { api } = fake();
  setStripeClientForTests(api);
  const ws = await testWorkspace("fc-scrub");
  const rowId = id("bank");
  await bankItems().insert({
    id: rowId,
    workspaceId: ws.id,
    provider: "stripe",
    status: "connected",
    institution: "Test Institution",
    linkTokenEnc: null,
    accessEnc: sealSecret(JSON.stringify({ customerId: "cus_test_1", accountIds: ["fca_boom"] }), ws.id, rowId),
    connectedAt: now(),
    createdAt: now(),
  });
  const view = await listBanks(ws.id, true);
  assert.match(view.items[0].note ?? "", /Stripe:/);
  assert.equal((view.items[0].note ?? "").includes("rk_test_restricted"), false);
});

test("stripe banks: plaid completion does not send a Stripe session to Plaid", async () => {
  keys();
  process.env.PLAID_CLIENT_ID = "cid_123";
  process.env.PLAID_SECRET = "plaid-secret-value";
  const ws = await testWorkspace("fc-skip");
  const rowId = id("bank");
  await bankItems().insert({
    id: rowId,
    workspaceId: ws.id,
    provider: "stripe",
    status: "pending",
    institution: "",
    linkTokenEnc: sealSecret("fcsess_should_not_go_to_plaid", ws.id, rowId),
    accessEnc: sealSecret(JSON.stringify({ customerId: "cus_test_1", accountIds: [] }), ws.id, rowId),
    connectedAt: null,
    createdAt: now(),
  });
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await completeLinks(ws.id), { connected: 0, waiting: 0 });
  assert.deepEqual(calls, []);
  assert.equal((await bankItems().list(ws.id))[0].status, "pending");
});

test("stripe banks: a configured server shows the card to everyone, without env names", async () => {
  keys();
  const ws = await testWorkspace("fc-vis");
  const user = banksView(await listBanks(ws.id, false), false) as { hidden?: boolean; configured?: boolean; stripe?: boolean };
  assert.equal(user.hidden, undefined);
  assert.equal(user.configured, true);
  assert.equal(user.stripe, true);
  assert.doesNotMatch(JSON.stringify(user), /STRIPE_|rk_test|pk_test/);
  const admin = banksView(await listBanks(ws.id, false), true) as { setupNeeded?: { id: string }[] };
  assert.ok(admin.setupNeeded?.some((x) => x.id === "plaid"));
  assert.equal(admin.setupNeeded?.some((x) => x.id === "stripe-fc"), false);
});
