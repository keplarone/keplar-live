import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openShare } from "@/lib/growth/share";
import { publicTitle } from "@/lib/growth/share-public";
import s from "@/components/share/Shared.module.css";
import { SharedBody, SharedCta } from "@/components/share/SharedBody";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic";

/**
 * The tab title and description stay generic and the page is noindex. The preview card (og:image) is drawn per page from the question the owner
 * chose to include and the real agreement line (see ./og/route.tsx): anyone with the link already sees both, and a revoked link has no card.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const r = await openShare(token).catch(() => null);
  const image = r ? `/r/${token}/og` : undefined;
  return {
    title: "A shared Keplar answer",
    description: "An answer shared by a Keplar user.",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    referrer: "no-referrer",
    ...(image
      ? {
          openGraph: { title: r?.question ? publicTitle(r.question) : "A shared Keplar answer", description: "Several AI models, one answer, on Keplar.", images: [{ url: image, width: 1200, height: 630, alt: "Preview of a shared Keplar answer" }] },
          twitter: { card: "summary_large_image" as const, title: "A shared Keplar answer", images: [image] },
        }
      : {}),
  };
}

export default async function SharedAnswer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openShare(token, { count: true }).catch(() => null);
  if (!r) notFound(); // a real 404 for revoked, expired or unknown links; see not-found.tsx
  return (
    <div className={s.page}>
      <p className={s.eyebrow} data-o="Shared eyebrow">A shared Keplar answer</p>
      <h1 className={s.title}><TwoTone text={"One question, several models, one answer."} /></h1>
      <p className={s.notice}>
        Shared by a Keplar user, who chose to make this link. Keplar has not verified it. Models can be wrong, even when they agree, so check anything important. {r.publicAt && !r.hiddenAt ? "The owner also chose to publish this answer as a public page." : "This page is not listed in search engines."}
      </p>

      <SharedBody r={r} />

      <SharedCta campaign="shared-answer" report={{ ref: `r:${token}`, excerpt: (r.question || r.markdown).slice(0, 400) }} />
    </div>
  );
}
