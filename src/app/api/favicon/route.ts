/**
 * Same-origin favicon for a source domain. The browser's content security policy
 * only allows images from this origin, so a citation's mark is fetched here.
 * The caller passes a hostname, never a URL. Private addresses are refused by safeFetch.
 */
import { faviconType, faviconUrl } from "@/lib/rich-answer/favicon";
import { safeFetch } from "@/lib/mcp/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  const url = faviconUrl(domain);
  if (!url) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const res = await safeFetch(url, { method: "GET", timeoutMs: 4_000, maxBytes: 48_000, maxRedirects: 2, headers: { accept: "image/*,*/*;q=0.1" } });
    const type = res.status === 200 ? faviconType(res.body) : null;
    if (!type) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(new Uint8Array(res.body), {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
}
