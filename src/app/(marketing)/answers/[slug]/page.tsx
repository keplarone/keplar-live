import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { SharedBody, SharedCta } from "@/components/share/SharedBody";
import s from "@/components/share/Shared.module.css";
import { openPublic, publicSummary, publicTitle } from "@/lib/growth/share-public";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";

export const dynamic = "force-dynamic"; // a takedown or "Make private" must show a 404 at once

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const r = await openPublic(slug).catch(() => null);
  if (!r || !r.question) return {};
  return pageMeta(`/answers/${slug}`, publicTitle(r.question), publicSummary(r.markdown), { image: `/answers/${slug}/og`, article: { published: r.publicAt!.slice(0, 10), modified: r.publicAt!.slice(0, 10) } });
}

export default async function PublicAnswer({ params }: Props) {
  const { slug } = await params;
  const r = await openPublic(slug, { count: true }).catch(() => null);
  if (!r || !r.question) notFound();
  const path = `/answers/${slug}`;
  const title = publicTitle(r.question);
  const org = { "@id": abs("/#organization") };
  const qa = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "@id": abs(`${path}#page`),
    url: abs(path),
    name: title,
    inLanguage: "en",
    isPartOf: { "@type": "CollectionPage", name: "Shared Keplar answers", url: abs("/answers") },
    mainEntity: {
      "@type": "Question",
      name: r.question.slice(0, 300),
      text: r.question,
      answerCount: 1,
      dateCreated: r.publicAt,
      // suggestedAnswer, not acceptedAnswer: nobody has accepted or verified this answer.
      suggestedAnswer: { "@type": "Answer", text: r.markdown.slice(0, 5000), dateCreated: r.publicAt, url: abs(path), author: org },
    },
  };
  return (
    <div className={s.page}>
      <p className={s.eyebrow}><Link href="/answers">Shared answers</Link></p>
      <h1 className={s.title}>{r.question.length > 160 ? title : r.question}</h1>
      <p className={s.notice}>
        An answer a Keplar user chose to publish. It was written by AI models working together and has not been checked by a person at Keplar, so it can be wrong even when the models agree. Check anything important with a reliable source.
      </p>
      <SharedBody r={r} answerHeading />
      <SharedCta campaign="public-answer" report={{ ref: `p:${slug}`, excerpt: r.question.slice(0, 400) }} />
      <JsonLd data={qa} />
      <JsonLd data={breadcrumbs([{ name: "Shared answers", path: "/answers" }, { name: title, path }])} />
    </div>
  );
}
