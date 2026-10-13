/**
 * Incoming webhooks: other services (form tools, Stripe, Zapier, a cron somewhere) can add records to an app's collection
 * with one POST to `<app>/_api/hooks/<collection>?key=<key>`. The key is an HMAC of the app, environment and collection, so
 * it can't be guessed and each one opens exactly one collection in one environment. The owner copies the URL from the
 * studio's Settings; records are created as owned by "hook" (shown as "Webhook") and go through the collection's field
 * rules like any other write. Nothing here runs the owner's code.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";

const keyFor = (appId: string, env: string, collection: string) =>
  createHmac("sha256", createHmac("sha256", authSecret()).update("keplar:app-hook:v1").digest()).update(`${appId}\u0001${env}\u0001${collection}`).digest("base64url").slice(0, 32);

export function hookKey(appId: string, env: "draft" | "live", collection: string): string {
  return keyFor(appId, env, collection);
}

export function checkHookKey(appId: string, env: string, collection: string, key: string | null): boolean {
  if (!key || env === "qa") return false;
  const want = Buffer.from(keyFor(appId, env, collection));
  const got = Buffer.from(key);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The record to create from a webhook body: `{ data: {...} }` or the body itself. The collection's fields are validated as for any
 *  write; extra keys are kept like on every record (bounded in count and size), so a payload such as Stripe's survives intact. */
export function hookRecord(body: Record<string, unknown>): Record<string, unknown> {
  const d = body.data;
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : body;
}
