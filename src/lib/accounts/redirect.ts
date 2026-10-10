/**
 * Where to send someone after signing in or up. Wraps `safeCallbackPath` (same-origin relative paths only; no
 * `//evil`, `https://evil`, backslashes or control characters) and also refuses the auth pages themselves, so a
 * crafted `?next=/signin` can't create a redirect loop.
 */

/**
 * Only same-origin relative paths are allowed ("/account", "/app?x=1").
 * Anything else (absolute URLs, protocol-relative "//evil", backslashes,
 * control characters) falls back to the default. Prevents open redirects.
 */
export function safeCallbackPath(input: string | null | undefined, fallback = "/account"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  try {
    const base = "https://keplar.invalid";
    const u = new URL(input, base);
    if (u.origin !== base) return fallback;
    return `${u.pathname}${u.search}${u.hash}` || fallback;
  } catch {
    return fallback;
  }
}

const AUTH_PAGES = /^\/(signin|signup|forgot-password|reset-password|verify-email)(?:[/?#]|$)/;

export function authRedirectPath(input: string | null | undefined, fallback = "/account"): string {
  const p = safeCallbackPath(input, fallback);
  return AUTH_PAGES.test(p) ? fallback : p;
}

/** `next` as a query string fragment for links between auth pages ("" when it is just the default). */
export const nextQuery = (next: string, fallback: string) => (next && next !== fallback ? `?next=${encodeURIComponent(next)}` : "");
