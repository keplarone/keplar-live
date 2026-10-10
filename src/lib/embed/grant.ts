/**
 * Short-lived proof that /embed was loaded from an allowlisted page.
 * The framed page's Referer is checked when the page renders; the ask route
 * trusts this signature, not a parent origin sent in the JSON body.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";

const TTL_SECONDS = 2 * 60 * 60;

type Grant = { w: string; o: string; e: number };

function mac(body: string) {
  return createHmac("sha256", authSecret()).update(`embed-grant:v1:${body}`).digest();
}

export function signEmbedGrant(widgetId: string, origin: string, nowMs = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ w: widgetId, o: origin, e: Math.floor(nowMs / 1000) + TTL_SECONDS } satisfies Grant)).toString("base64url");
  return `v1.${body}.${mac(body).toString("base64url")}`;
}

/** Returns the origin bound into a valid grant for this widget, or null. */
export function readEmbedGrant(token: string | null | undefined, widgetId: string, nowMs = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  const expected = mac(parts[1]);
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: Grant;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Grant;
  } catch {
    return null;
  }
  if (payload?.w !== widgetId || typeof payload.o !== "string" || typeof payload.e !== "number") return null;
  if (payload.e <= Math.floor(nowMs / 1000)) return null;
  return payload.o;
}
