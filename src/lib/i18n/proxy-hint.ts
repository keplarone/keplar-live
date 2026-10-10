/**
 * The proxy's part of language detection: read the saved choice and Accept-Language, and leave a short-lived hint cookie for
 * the LocaleSuggest banner. It only ever ADDS a cookie to the normal response; it never redirects or rewrites, and crawlers
 * (and any request without a user agent) get nothing, so every locale URL serves the same content to everyone.
 */
import type { NextRequest, NextResponse } from "next/server";
import { HINT_COOKIE, LOCALE_COOKIE, suggestLocale } from "./detect";

/** The visitor's preferred locale to remember as a hint, or null (bots, non-document requests, hint already set, no match). */
export function localeHintFor(req: Pick<NextRequest, "method" | "headers" | "cookies">): string | null {
  if (req.method !== "GET") return null;
  const accept = req.headers.get("accept") ?? "";
  if (accept && !accept.includes("text/html")) return null; // documents only, not RSC or asset requests
  if (req.cookies.get(HINT_COOKIE)) return null;
  return suggestLocale({
    cookie: req.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: req.headers.get("accept-language"),
    userAgent: req.headers.get("user-agent"),
  });
}

export function applyLocaleHint(req: Parameters<typeof localeHintFor>[0], res: NextResponse): NextResponse {
  const hint = localeHintFor(req);
  if (hint) res.cookies.set(HINT_COOKIE, hint, { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", httpOnly: false });
  return res;
}
