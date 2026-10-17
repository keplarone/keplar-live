import { renderOg } from "@/lib/og";
import { OG_TITLE_MAX, verifyOgTitle } from "@/lib/og-page";
import { site } from "@/lib/site";

/** Share card with a page's own title (see src/lib/og-page.ts). Only titles signed by pageMeta are drawn. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get("t") ?? "").slice(0, OG_TITLE_MAX);
  const sig = url.searchParams.get("s") ?? "";
  if (!title || !verifyOgTitle(title, sig)) return new Response("Not found", { status: 404 });
  const res = await renderOg({ label: site.name, title: title.length > 58 ? `${title.slice(0, 55)}…` : title, subtitle: "One question. Multiple intelligences. One answer." });
  res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return res;
}
