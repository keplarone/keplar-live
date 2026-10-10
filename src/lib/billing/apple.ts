/**
 * Apple In-App Purchase (StoreKit 2) helpers for Keplar One (bundle one.keplar.app).
 *
 * Product IDs mirror Plus $45 / Pro $99 monthly (same tiers as Whop on the web).
 * Verification uses Apple's SignedDataVerifier + public Apple Root CAs (bundled).
 * App Store Server API credentials (issuer/key/private key) are optional and only
 * needed for proactive Server API calls — not for ASN V2 or client JWS verify.
 *
 * Without APPLE_BUNDLE_ID (or APPLE_IAP_ENABLED=1) the endpoints answer 503 (safe to deploy empty).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Environment, SignedDataVerifier, type JWSTransactionDecodedPayload, type ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import type { PaidPlan } from "./plans";

export const APPLE_BUNDLE_ID_DEFAULT = "one.keplar.app";

/** Auto-renewable subscription product IDs (App Store Connect). */
export const APPLE_PRODUCT_IDS = {
  plus: "one.keplar.plus.monthly",
  pro: "one.keplar.pro.monthly",
} as const satisfies Record<Exclude<PaidPlan, "lite">, string>;

export type AppleProductId = (typeof APPLE_PRODUCT_IDS)[keyof typeof APPLE_PRODUCT_IDS];

export const APPLE_PRODUCT_ID_LIST: AppleProductId[] = [APPLE_PRODUCT_IDS.plus, APPLE_PRODUCT_IDS.pro];

export function planForAppleProductId(id: unknown): Exclude<PaidPlan, "lite"> | null {
  if (typeof id !== "string" || !id) return null;
  if (id === APPLE_PRODUCT_IDS.plus) return "plus";
  if (id === APPLE_PRODUCT_IDS.pro) return "pro";
  return null;
}

export function appleProductIdForPlan(plan: Exclude<PaidPlan, "lite">): AppleProductId {
  return APPLE_PRODUCT_IDS[plan];
}

const env = (k: string) => process.env[k]?.trim() || "";

/** Prefer explicit env; fall back only when APPLE_IAP_ENABLED=1 with the known bundle id. */
export function appleBundleId(): string | null {
  const v = env("APPLE_BUNDLE_ID");
  if (v) return v;
  if (env("APPLE_IAP_ENABLED") === "1") return APPLE_BUNDLE_ID_DEFAULT;
  return null;
}

/** True when ASN / verify can run (bundle id set; root CAs are public and bundled). */
export function appleIapConfigured(): boolean {
  return appleBundleId() !== null;
}

export function appleEnvironment(): Environment {
  const v = env("APPLE_ENVIRONMENT").toLowerCase();
  if (v === "production" || v === "prod" || v === "live") return Environment.PRODUCTION;
  return Environment.SANDBOX;
}

export function appleAppAppleId(): number | undefined {
  const raw = env("APPLE_APP_APPLE_ID");
  if (!raw || !/^\d{5,15}$/.test(raw)) return undefined;
  return Number(raw);
}

/** Server API JWT credentials (optional). Documented for later; not required for ASN/verify. */
export function appleServerApiConfigured(): boolean {
  return Boolean(env("APPLE_ISSUER_ID") && env("APPLE_KEY_ID") && (env("APPLE_PRIVATE_KEY") || env("APPLE_PRIVATE_KEY_PATH")));
}

let rootCAs: Buffer[] | null = null;

function loadRootCAs(): Buffer[] {
  if (rootCAs) return rootCAs;
  const dir = join(process.cwd(), "src/lib/billing/apple-certs");
  rootCAs = [readFileSync(join(dir, "AppleRootCA-G3.cer")), readFileSync(join(dir, "AppleRootCA-G2.cer"))];
  return rootCAs;
}

function makeVerifier(environment: Environment): SignedDataVerifier {
  const bundleId = appleBundleId();
  if (!bundleId) throw new Error("APPLE_BUNDLE_ID is not set");
  const appAppleId = appleAppAppleId();
  if (environment === Environment.PRODUCTION && appAppleId === undefined) {
    throw new Error("APPLE_APP_APPLE_ID is required when APPLE_ENVIRONMENT=Production");
  }
  // Online OCSP checks off by default in serverless (timeouts); set APPLE_ONLINE_CHECKS=1 to enable.
  const online = env("APPLE_ONLINE_CHECKS") === "1";
  return new SignedDataVerifier(loadRootCAs(), online, environment, bundleId, appAppleId);
}

export type DecodedAppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  plan: Exclude<PaidPlan, "lite">;
  bundleId: string;
  environment: string;
  expiresDate: string | null;
  purchaseDate: string | null;
  revocationDate: string | null;
  appAccountToken: string | null;
  raw: JWSTransactionDecodedPayload;
};

function toIso(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

export function decodeTransactionPayload(tx: JWSTransactionDecodedPayload): DecodedAppleTransaction | null {
  const productId = typeof tx.productId === "string" ? tx.productId : "";
  const plan = planForAppleProductId(productId);
  const transactionId = typeof tx.transactionId === "string" ? tx.transactionId : "";
  const originalTransactionId = typeof tx.originalTransactionId === "string" ? tx.originalTransactionId : transactionId;
  if (!plan || !transactionId || !originalTransactionId) return null;
  return {
    transactionId,
    originalTransactionId,
    productId,
    plan,
    bundleId: typeof tx.bundleId === "string" ? tx.bundleId : "",
    environment: typeof tx.environment === "string" ? tx.environment : "",
    expiresDate: toIso(tx.expiresDate),
    purchaseDate: toIso(tx.purchaseDate),
    revocationDate: toIso(tx.revocationDate),
    appAccountToken: typeof tx.appAccountToken === "string" ? tx.appAccountToken : null,
    raw: tx,
  };
}

/**
 * Verify a StoreKit 2 transaction JWS (purchaseToken / jwsRepresentation).
 * Tries Sandbox then Production (or the configured env first) so TestFlight + prod both work.
 */
export async function verifySignedTransaction(signedTransaction: string): Promise<DecodedAppleTransaction> {
  if (!appleBundleId()) throw new AppleIapNotConfiguredError();
  if (typeof signedTransaction !== "string" || signedTransaction.split(".").length !== 3) {
    throw new AppleIapVerifyError("Invalid signed transaction.", 400);
  }
  const preferred = appleEnvironment();
  const order = preferred === Environment.PRODUCTION ? [Environment.PRODUCTION, Environment.SANDBOX] : [Environment.SANDBOX, Environment.PRODUCTION];
  let last: unknown;
  for (const environment of order) {
    try {
      if (environment === Environment.PRODUCTION && appleAppAppleId() === undefined) continue;
      const verifier = makeVerifier(environment);
      const tx = await verifier.verifyAndDecodeTransaction(signedTransaction);
      const decoded = decodeTransactionPayload(tx);
      if (!decoded) throw new AppleIapVerifyError("Unknown or unsupported product.", 400);
      if (decoded.bundleId && decoded.bundleId !== appleBundleId()) {
        throw new AppleIapVerifyError("Bundle id mismatch.", 401);
      }
      return decoded;
    } catch (e) {
      if (e instanceof AppleIapVerifyError) throw e;
      last = e;
    }
  }
  throw new AppleIapVerifyError("Could not verify Apple transaction.", 401, last);
}

export async function verifySignedNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  if (!appleBundleId()) throw new AppleIapNotConfiguredError();
  if (typeof signedPayload !== "string" || signedPayload.split(".").length !== 3) {
    throw new AppleIapVerifyError("Invalid signedPayload.", 400);
  }
  const preferred = appleEnvironment();
  const order = preferred === Environment.PRODUCTION ? [Environment.PRODUCTION, Environment.SANDBOX] : [Environment.SANDBOX, Environment.PRODUCTION];
  let last: unknown;
  for (const environment of order) {
    try {
      if (environment === Environment.PRODUCTION && appleAppAppleId() === undefined) continue;
      return await makeVerifier(environment).verifyAndDecodeNotification(signedPayload);
    } catch (e) {
      last = e;
    }
  }
  throw new AppleIapVerifyError("Could not verify Apple notification.", 401, last);
}

export class AppleIapNotConfiguredError extends Error {
  status = 503;
  code = "apple_iap_not_configured";
  constructor() {
    super("Apple IAP is not configured.");
  }
}

export class AppleIapVerifyError extends Error {
  constructor(
    message: string,
    public status: number,
    public cause?: unknown,
  ) {
    super(message);
  }
}

/** Test helper: map a decoded-looking fixture without crypto. */
export function decodedFromFixture(fx: {
  transactionId: string;
  originalTransactionId?: string;
  productId: string;
  bundleId?: string;
  environment?: string;
  expiresDateMs?: number;
  purchaseDateMs?: number;
  revocationDateMs?: number;
  appAccountToken?: string | null;
}): DecodedAppleTransaction | null {
  return decodeTransactionPayload({
    transactionId: fx.transactionId,
    originalTransactionId: fx.originalTransactionId ?? fx.transactionId,
    productId: fx.productId,
    bundleId: fx.bundleId ?? APPLE_BUNDLE_ID_DEFAULT,
    environment: fx.environment ?? "Sandbox",
    expiresDate: fx.expiresDateMs,
    purchaseDate: fx.purchaseDateMs,
    revocationDate: fx.revocationDateMs,
    appAccountToken: fx.appAccountToken ?? undefined,
  } as JWSTransactionDecodedPayload);
}
