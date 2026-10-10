/**
 * Fetches one product page, and its images, on behalf of a signed-in user.
 * Every request goes through the shared SSRF-safe fetch (public IPs only, DNS pinned, redirects re-validated, size and time
 * limits). On top of that: robots.txt is honoured for KeplarBot (also after redirects, and for image hosts), a page that
 * says `noai` is refused and `noimageai` keeps its images out, only HTML is parsed, no cookies or credentials are ever sent,
 * and no Referer is sent. The result is a plain object; nothing from the page is executed or rendered here.
 */
import { checkUrl, FetchError, safeFetch, SsrfError } from "@/lib/mcp/ssrf";
import { extractProduct, type Extracted } from "./extract";
import { IMAGE_TIMEOUT_MS, MAX_PAGE_BYTES, MAX_SOURCE_IMAGE_BYTES, PAGE_TIMEOUT_MS } from "./limits";
import { BOT_UA, robotsAllows } from "./robots";

export type ImportFailure = "invalid_url" | "private" | "robots" | "noai" | "not_found" | "denied" | "rate" | "server" | "timeout" | "network" | "too_large" | "not_html" | "redirect" | "empty";

export class ImportError extends Error {
  constructor(public code: ImportFailure, message: string) {
    super(message);
  }
}

const FRIENDLY: Record<ImportFailure, string> = {
  invalid_url: "That doesn't look like a web address. Paste the full link to the product page, starting with https://.",
  private: "Keplar can only read public web pages. That address points to a private or internal network.",
  robots: "That site asks automated tools not to read this page, so Keplar didn't. You can enter the product details yourself instead.",
  noai: "That page asks not to be used by AI tools, so Keplar didn't read it. You can enter the product details yourself instead.",
  not_found: "That page wasn't found (404). Check the link, or enter the product details yourself.",
  denied: "That site blocks automated access (it needs a login, or refuses non-browser visitors). Enter the product details yourself, or upload a photo.",
  rate: "That site is asking us to slow down. Try again in a few minutes, or enter the details yourself.",
  server: "That site had a problem and couldn't show the page. Try again later, or enter the details yourself.",
  timeout: "That site took too long to respond. Try again, or enter the product details yourself.",
  network: "Keplar couldn't connect to that site. Check the link, or enter the product details yourself.",
  too_large: "That page is too large to read. Enter the product details yourself, or upload a photo.",
  not_html: "That link isn't a web page (it points to a file or an image). To use a photo, upload it instead.",
  redirect: "That link redirects too many times or in a way Keplar won't follow. Open it in your browser and paste the final address.",
  empty: "That page didn't contain readable product details. It may load its content with scripts. You can enter the details yourself or upload a photo.",
};
export const importMessage = (c: ImportFailure) => FRIENDLY[c];

const HEADERS = {
  "user-agent": BOT_UA,
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  "accept-language": "en-US,en;q=0.8",
  // Deliberately absent: cookie, authorization, referer.
};

function mapNetworkError(e: unknown): ImportError {
  if (e instanceof ImportError) return e;
  if (e instanceof SsrfError) return new ImportError(e.code === "invalid_url" ? "invalid_url" : e.code === "dns" ? "network" : "private", FRIENDLY[e.code === "invalid_url" ? "invalid_url" : e.code === "dns" ? "network" : "private"]);
  if (e instanceof FetchError) {
    const c: ImportFailure = e.kind === "timeout" ? "timeout" : e.kind === "too_large" ? "too_large" : e.kind === "redirect" ? "redirect" : "network";
    return new ImportError(c, FRIENDLY[c]);
  }
  return new ImportError("network", FRIENDLY.network);
}

/* ---------- robots.txt (cached for one import) ---------- */

export type RobotsCache = Map<string, Promise<string | null>>;

async function loadRobots(origin: string): Promise<string | null> {
  let res;
  try {
    res = await safeFetch(origin + "/robots.txt", { headers: HEADERS, timeoutMs: 6000, maxBytes: 600_000, maxRedirects: 3, stopWhen: (b) => b.length >= 500_000 });
  } catch (e) {
    if (e instanceof SsrfError) throw mapNetworkError(e);
    // RFC 9309: robots.txt can't be reached → assume the site wants no crawling.
    throw new ImportError("robots", FRIENDLY.robots);
  }
  if (res.status >= 500 || res.status === 429) throw new ImportError("robots", FRIENDLY.robots);
  if (res.status >= 400) return null; // no robots.txt (or access to it is denied by 4xx): nothing restricts us
  const text = res.body.toString("utf8");
  if (/^\s*</.test(text) && /<html/i.test(text.slice(0, 500))) return null; // a soft-404 HTML page, not a robots file
  return text;
}

export async function assertRobotsAllow(url: string, cache: RobotsCache): Promise<void> {
  const u = new URL(url);
  let p = cache.get(u.origin);
  if (!p) {
    p = loadRobots(u.origin);
    cache.set(u.origin, p);
  }
  const txt = await p;
  if (!robotsAllows(txt, u.pathname + u.search)) throw new ImportError("robots", FRIENDLY.robots);
}

/* ---------- page ---------- */

export type FetchedPage = { finalUrl: string; host: string; extracted: Extracted; bytes: number; truncated: boolean };

function decode(buf: Buffer, contentType: string): string {
  const head = buf.subarray(0, 4096).toString("latin1");
  const cs = (/charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(cs, { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

export async function fetchProductPage(rawUrl: string, cache: RobotsCache = new Map()): Promise<FetchedPage> {
  let url: URL;
  try {
    url = checkUrl(rawUrl);
  } catch (e) {
    throw mapNetworkError(e);
  }
  await assertRobotsAllow(url.toString(), cache);
  let res;
  try {
    res = await safeFetch(url.toString(), { headers: HEADERS, timeoutMs: PAGE_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES + 200_000, maxRedirects: 4, stopWhen: (b) => b.length >= MAX_PAGE_BYTES, beforeRedirect: (next) => assertRobotsAllow(next.toString(), cache) });
  } catch (e) {
    throw mapNetworkError(e);
  }
  if (res.status === 404 || res.status === 410) throw new ImportError("not_found", FRIENDLY.not_found);
  if (res.status === 401 || res.status === 403 || res.status === 451 || res.status === 407) throw new ImportError("denied", FRIENDLY.denied);
  if (res.status === 429) throw new ImportError("rate", FRIENDLY.rate);
  if (res.status >= 500) throw new ImportError("server", FRIENDLY.server);
  if (res.status < 200 || res.status >= 300) throw new ImportError(res.status >= 300 && res.status < 400 ? "redirect" : "network", FRIENDLY[res.status >= 300 && res.status < 400 ? "redirect" : "network"]);
  const ct = (res.headers["content-type"] ?? "").toLowerCase();
  if (!/^(text\/html|application\/xhtml\+xml)\b/.test(ct)) throw new ImportError("not_html", FRIENDLY.not_html);
  const xrt = (res.headers["x-robots-tag"] ?? "").toLowerCase();
  if (/\bnoai\b/.test(xrt)) throw new ImportError("noai", FRIENDLY.noai);
  const html = decode(res.body, ct);
  const extracted = extractProduct(html, res.finalUrl);
  if (extracted.noai) throw new ImportError("noai", FRIENDLY.noai);
  if (/\bnoimageai\b/.test(xrt)) extracted.noimageai = true;
  if (extracted.noimageai) extracted.images = [];
  if (!extracted.title && !extracted.description && !extracted.images.length && !extracted.text) throw new ImportError("empty", FRIENDLY.empty);
  return { finalUrl: res.finalUrl, host: new URL(res.finalUrl).hostname.replace(/^www\./, ""), extracted, bytes: res.body.length, truncated: res.body.length >= MAX_PAGE_BYTES };
}

/* ---------- image ---------- */

/** Downloads one image's bytes. Type and size are verified later by prepareImage (magic bytes + sharp), not by trusting headers. */
export async function fetchImageBytes(rawUrl: string, cache: RobotsCache): Promise<Buffer> {
  const u = checkUrl(rawUrl);
  await assertRobotsAllow(u.toString(), cache);
  const res = await safeFetch(u.toString(), {
    headers: { "user-agent": BOT_UA, accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1" },
    timeoutMs: IMAGE_TIMEOUT_MS,
    maxBytes: MAX_SOURCE_IMAGE_BYTES,
    maxRedirects: 3,
    beforeRedirect: (next) => assertRobotsAllow(next.toString(), cache),
  });
  if (res.status < 200 || res.status >= 300) throw new ImportError("network", "The image couldn't be downloaded.");
  const ct = (res.headers["content-type"] ?? "").toLowerCase();
  if (ct && !/^(image\/|application\/octet-stream|binary\/octet-stream)/.test(ct)) throw new ImportError("not_html", "That link isn't an image.");
  if (/\bnoai\b|\bnoimageai\b/.test((res.headers["x-robots-tag"] ?? "").toLowerCase())) throw new ImportError("noai", "That image asks not to be used by AI tools.");
  return res.body;
}
