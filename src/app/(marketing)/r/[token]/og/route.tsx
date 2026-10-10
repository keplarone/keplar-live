import { openShare } from "@/lib/growth/share";
import { publicTitle } from "@/lib/growth/share-public";
import { agreementLine } from "@/lib/growth/share-text";
import { renderOg } from "@/lib/og";

export const dynamic = "force-dynamic";

/**
 * Preview card for a private shared link, drawn per page from what the owner put in it: their question (only if they left it ticked in
 * the Share dialog) and the real agreement line. Anyone holding the link already sees both. A revoked, expired or unknown link is a 404.
 * The card is never cached by shared caches, so revoking takes effect at once.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await openShare((await ctx.params).token).catch(() => null);
  if (!r) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const c = r.consensus;
  const t = r.question ? publicTitle(r.question) : "A shared Keplar answer";
  const res = await renderOg({
    label: "Shared answer",
    title: t.length > 62 ? `${t.slice(0, 59)}…` : t,
    subtitle: c.level === "single" || c.level === "unscored" ? "Several AI models, one answer, on Keplar" : agreementLine(c.level, c.agree, c.disagree, c.responded, c.consulted).split(". ")[0].replace(/\.$/, ""),
  });
  res.headers.set("cache-control", "private, no-store");
  res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  return res;
}
