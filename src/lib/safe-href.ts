/**
 * Link targets that may be rendered from model or user-written markdown: http(s), mailto, or a path on this site.
 * "//host" and "/\host" are NOT paths on this site (browsers read them as another origin), so they are refused.
 * Control characters and leading/trailing whitespace are refused (browsers can ignore whitespace before a scheme).
 */
export function safeHref(href: string | undefined | null): boolean {
  if (!href) return false;
  if (/[\u0000-\u001f\u007f]/.test(href)) return false;
  if (href !== href.trim()) return false;
  if (/^(https?:|mailto:)/i.test(href)) return true;
  return href.startsWith("/") && !/^\/[\\/]/.test(href);
}
