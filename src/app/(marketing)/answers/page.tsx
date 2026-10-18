import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import s from "@/components/share/Shared.module.css";
import { listPublic, publicSummary, publicTitle } from "@/lib/growth/share-public";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const list = await listPublic(1).catch(() => []);
  // An empty index is a thin page: noindex, follow until a public answer exists. The sitemap already omits it while empty.
  return pageMeta("/answers", "Shared answers from Keplar users", "Answers that Keplar users chose to publish: one question, several AI models, with how many agreed and where they differed.", { noindex: list.length === 0 });
}

export default async function Answers() {
  const list = await listPublic(100).catch(() => []);
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Shared answers</p>
      <h1 className={s.title}><TwoTone text={"Answers Keplar users chose to publish."} /></h1>
      <p className={s.notice}>
        Each page shows one question, the answer several AI models produced together, how many agreed and where they differed. Users opt in page by page and can take a page down at any time. Keplar has not checked these answers, so verify anything important.
      </p>
      {list.length ? (
        <ul className={s.list} style={{ marginTop: "var(--s-8)" }}>
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/answers/${r.publicSlug}`}>{publicTitle(r.question ?? "")}</Link>
              <span className={s.muted}>{publicSummary(r.markdown, 140)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.muted} style={{ marginTop: "var(--s-8)" }}>No public answers yet. To publish one, open Share on any answer in Keplar and choose Make public.</p>
      )}
      <div className={s.cta}>
        <Link className={s.btn} href="/app?utm_source=answers&utm_medium=index">Ask your own question, free</Link>
      </div>
      <JsonLd data={breadcrumbs([{ name: "Shared answers", path: "/answers" }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Shared Keplar answers", url: abs("/answers"), inLanguage: "en" }} />
    </div>
  );
}
