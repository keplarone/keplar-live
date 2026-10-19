/** Imported first by every test: isolated data dir, no provider keys, no network. */
import { mkdtempSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// Components import CSS modules. Node has no CSS loader; class names pass through so render tests can import them.
const cssExt = Module as unknown as { _extensions: Record<string, (m: NodeJS.Module, f: string) => void> };
cssExt._extensions[".css"] = (mod, filename) => {
  (mod as NodeJS.Module & { _compile: (src: string, file: string) => void })._compile("const s = new Proxy({}, { get: (_, k) => String(k) }); module.exports = Object.assign(s, { __esModule: true, default: s });", filename);
};

process.env.KEPLAR_MX_CHECK = "off"; // no DNS in tests; tests/email-domain.test.ts turns it on with a fake resolver
process.env.KEPLAR_DATA_DIR = mkdtempSync(path.join(tmpdir(), "keplar-test-"));
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET_LIVE", "KEPLAR_STRIPE_MODE", "KEPLAR_PAYMENTS_DISABLED", "KEPLAR_MIN_ORDER_CENTS", "KEPLAR_MAX_ORDER_CENTS", "KEPLAR_APPLICATION_FEE_BPS", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "INNGEST_DEV", "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_FREE", "OPENAI_API_KEY", "NVIDIA_API_KEY", "KEPLAR_LIVE_MODELS", "KEPLAR_MODEL_CLASSIFIER", "KEPLAR_AUTH_REQUIRED", "KEPLAR_STRIPE_ALLOW_LIVE", "STRIPE_PORTAL_CONFIGURATION_ID", "STRIPE_PORTAL_CONFIGURATION_ID_TEST", "UPSTASH_REDIS_REST_URL", "WHOP_API_KEY", "WHOP_COMPANY_ID", "WHOP_WEBHOOK_SECRET", "DATABASE_URL", "KEPLAR_ADMIN_EMAILS", "KEPLAR_ADMIN_DAILY_USD_CAP", "BETTER_AUTH_SECRET", "RESEND_API_KEY"]) {
  delete process.env[k];
}

// The shared-Free-pool governor (src/lib/orchestration/pool-governor.ts) is effectively off for ordinary tests; tests/free-pool.test.ts builds its own governors.
process.env.FREE_POOL_DAILY_LIMIT ??= "1000000";
process.env.FREE_POOL_RPM ??= "1000000";
