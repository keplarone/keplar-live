/**
 * The network guard for the site QA browser (run.ts): a headless Chromium on our servers opening user-authored drafts.
 *  - Public web only: every request (every redirect hop too) is checked like an MCP server address (mcp/ssrf.ts#checkUrl plus
 *    a DNS check that every address is public); private, loopback, link-local and metadata addresses are refused.
 *  - Fetches go through a socket pinned to the checked address (no DNS rebinding); WebSockets are closed.
 * (Moved here from the removed Keplar Browser feature, which used the same guard.)
 */
import dns from "node:dns";
import type { BrowserContext, Route } from "playwright-core";
import { checkUrl, directTransport, isPublicIp, resolvePublic } from "@/lib/mcp/ssrf";

const ACTION_MS = 15_000;

export type Resolver = (host: string) => Promise<string[]>;
export type Fetched = { status: number; headers: Record<string, string>; body: Buffer };
/** Fetches one allowed address for a request WITHOUT following redirects (tests serve fixtures here instead of the network). */
export type Transport = (route: Route, url: string) => Promise<Fetched>;
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;
/**
 * The request is made from here, not by Chromium or Playwright's own client, so the socket is pinned to the address that was
 * just checked: a DNS answer that changes between the check and the connection (DNS rebinding) can't reach a private address.
 */
export const networkTransport: Transport = async (route, url) => {
  const u = checkUrl(url, { allowHttp: true });
  const ip = await resolvePublic(u.hostname);
  const req = route.request();
  const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !/^(host|cookie|accept-encoding|content-length|connection)$/i.test(k)));
  const method = req.method().toUpperCase();
  const res = await directTransport({ url: u, ip, method, headers, body: method === "GET" || method === "HEAD" ? undefined : req.postData() ?? undefined, timeoutMs: ACTION_MS, maxBytes: MAX_RESPONSE_BYTES });
  return { status: res.status, headers: res.headers, body: res.body };
};
const MAX_HOPS = 5;
const attr = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const originOf = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

export const dnsResolve: Resolver = async (host) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** May the browser load this address? Public http(s) only, every resolved address public; data:/blob:/about: stay in the page. */
export async function allowedUrl(raw: string, resolve: Resolver = dnsResolve): Promise<boolean> {
  if (/^(data|blob|about):/i.test(raw)) return true;
  let u: URL;
  try {
    u = checkUrl(raw, { allowHttp: true });
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  try {
    const ips = await resolve(host);
    return ips.length > 0 && ips.every(isPublicIp);
  } catch {
    return false;
  }
}

/**
 * Keplar only reads: a page load that would SEND something (a POST/PUT/PATCH/DELETE navigation, i.e. a form submission,
 * however it was triggered: a neutral-label button, Enter, or the page's own script after a click) is refused.
 */
export function sendsData(req: { method: string; resourceType: string }): boolean {
  return req.resourceType === "document" && !/^(GET|HEAD)$/i.test(req.method);
}

/**
 * Route every request through the guard. A redirect is never handed to Chromium (it would follow it without asking this
 * route again): each hop is checked here; a page redirect becomes a fresh navigation, which comes back through the guard.
 * `trustedOrigin` (the QA run: our own server, which may be localhost in development) is passed straight
 * through, form posts included; everything else gets the public-web-only, read-only rules.
 */
export async function guardContext(ctx: BrowserContext, resolve: Resolver, transport: Transport, blocked: Set<string>, sent: Set<string> = new Set(), opts: { trustedOrigin?: string } = {}) {
  // WebSockets don't pass through ctx.route: close every one, so page script can't open a socket to a private address.
  if (typeof ctx.routeWebSocket === "function") await ctx.routeWebSocket(/.*/, (ws) => { void ws.close({ code: 1008, reason: "blocked" }); });
  await ctx.route("**/*", async (route: Route) => {
    const req = route.request();
    const type = req.resourceType();
    if (opts.trustedOrigin && originOf(req.url()) === opts.trustedOrigin) return route.continue();
    if (type === "media" || type === "websocket" || type === "eventsource") return route.abort("blockedbyclient");
    if (sendsData({ method: req.method(), resourceType: type })) {
      sent.add(req.url().slice(0, 200));
      return route.abort("blockedbyclient");
    }
    if (!(await allowedUrl(req.url(), resolve))) {
      if (type === "document") blocked.add(req.url().slice(0, 200));
      return route.abort("blockedbyclient");
    }
    if (/^(data|blob|about):/i.test(req.url())) return route.continue();
    try {
      let url = req.url();
      for (let hop = 0; hop <= MAX_HOPS; hop++) {
        const res = await transport(route, url);
        const loc = res.status >= 300 && res.status < 400 ? res.headers["location"] : undefined;
        if (!loc) {
          const headers = Object.fromEntries(Object.entries(res.headers).filter(([k]) => !/^(content-encoding|content-length|transfer-encoding|set-cookie)$/i.test(k)));
          return await route.fulfill({ status: res.status, headers, body: res.body });
        }
        const next = new URL(loc, url).toString();
        if (!(await allowedUrl(next, resolve))) {
          if (type === "document") blocked.add(next.slice(0, 200));
          return await route.abort("blockedbyclient");
        }
        if (type === "document") return await route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta http-equiv="refresh" content="0;url=${attr(next)}">` });
        url = next;
      }
      await route.abort("failed");
    } catch {
      await route.abort("failed").catch(() => undefined);
    }
  });
}
