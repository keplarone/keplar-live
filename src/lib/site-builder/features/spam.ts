/**
 * Spam defense for public feature forms, with no captcha and no script on the page:
 *  - a signed form token that carries the time the form was drawn (too fast = a bot, too old = reload),
 *  - a honeypot field humans never see,
 *  - a cap on links, and the callers' rate limits.
 * (A proof-of-work step would need a script on the page, which the site sandbox does not allow yet: listed as coming soon.)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.BETTER_AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-form-secret");
const sign = (siteId: string, ts: number) => createHmac("sha256", secret()).update(`kf1:${siteId}:${ts}`).digest("base64url").slice(0, 22);

export function issueToken(siteId: string, at = Date.now()): string {
  return `${at.toString(36)}.${sign(siteId, at)}`;
}

export type TokenCheck = "ok" | "too-fast" | "expired" | "invalid";
export function checkToken(token: string | undefined, siteId: string, at = Date.now(), minMs = 1500, maxMs = 24 * 3600_000): TokenCheck {
  if (!secret()) return "invalid";
  const [t, sig] = (token ?? "").split(".");
  const ts = parseInt(t ?? "", 36);
  if (!sig || !Number.isFinite(ts)) return "invalid";
  const want = Buffer.from(sign(siteId, ts));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "invalid";
  if (at - ts < minMs) return "too-fast";
  if (at - ts > maxMs) return "expired";
  return "ok";
}

/** True when the values look like link spam. */
export function linkSpam(values: string[], max = 2): boolean {
  const n = values.reduce((c, v) => c + (v.match(/https?:\/\/|www\.|<a\s/gi)?.length ?? 0), 0);
  return n > max;
}
