/**
 * An OAuth callback that failed because of the outage redirects to /signin?error=unable_to_create_user (or similar), which the page
 * shows as "couldn't confirm a verified email". Say what actually happened instead: the error becomes `unavailable`. Cookies and
 * every other part of the redirect are kept as they were.
 */
export function outageRedirect(res: Response, req: Request): Response {
  const loc = res.headers.get("location");
  if (!loc) return res;
  const u = new URL(loc, req.url);
  if (!u.searchParams.has("error")) return res;
  u.searchParams.set("error", "unavailable");
  const headers = new Headers(res.headers);
  headers.set("location", /^https?:\/\//i.test(loc) ? u.toString() : `${u.pathname}${u.search}${u.hash}`);
  return new Response(null, { status: res.status, headers });
}
