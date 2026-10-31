import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportAnswer } from "@/components/app-ui/ReportAnswer";
import { JsonLd } from "@/components/seo/JsonLd";
import { RemixPanel } from "@/components/templates/RemixPanel";
import { LikeButton } from "@/components/templates/LikeButton";
import s from "@/components/templates/Templates.module.css";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { CATEGORY_LABEL } from "@/lib/templates/constants";
import { openTemplate } from "@/lib/templates/store";

export const dynamic = "force-dynamic"; // withdrawn, hidden or deleted templates must 404 at once

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await openTemplate(slug).catch(() => null);
  if (!t) return {};
  return pageMeta(`/templates/${slug}`, `${t.view.title} website template`, t.view.description, { image: `/templates/${slug}/og` });
}

export default async function TemplatePage({ params }: Props) {
  const { slug } = await params;
  const t = await openTemplate(slug).catch(() => null);
  if (!t) notFound();
  const v = t.view;
  const path = `/templates/${slug}`;
  return (
    <div className={s.page}>
      <p className={s.eyebrow} data-o="Templates eyebrow"><Link href="/templates">Templates</Link></p>
      <h1 className={s.title}>{v.title}</h1>
      <p className={s.lead}>{v.description}</p>
      <div className={s.chips}>
        <span className={s.chip}>{CATEGORY_LABEL[v.category]}</span>
        <span className={s.chip}>{v.kind === "starter" ? "Keplar starter" : "Community template (beta)"}</span>
        {v.credit ? <span className={s.chip}>Shared by {v.credit}</span> : null}
        {v.remixes > 0 ? <span className={s.chip}>{v.remixes} remix{v.remixes === 1 ? "" : "es"}</span> : null}
        {v.kind === "community" ? <LikeButton slug={slug} initial={v.likes} /> : null}
      </div>
      <p className={s.notice}>
        {v.kind === "starter"
          ? "Made by Keplar's template builder (not the AI model) and checked to build, lint and pass the safety scan. The text is placeholder copy for you to replace."
          : "Shared by its owner as a snapshot. Checked for contact details and unsafe content when it was shared; Keplar has not edited it. Report anything wrong below."}
      </p>

      <div className={s.detail}>
        <section aria-label="Preview">
          <div className={s.preview}>
            <iframe className={s.previewFrame} src={`/sites/template/${slug}`} title={`Preview of the ${v.title} template`} sandbox="allow-popups" referrerPolicy="no-referrer" loading="lazy" />
          </div>
          <p className={s.notice}>Pages: {v.pages.join(", ")}. The preview is read-only; forms and features come alive in your own copy.</p>
        </section>
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <RemixPanel slug={slug} title={v.title} credit={v.credit} />
          <div id="report">
            <ReportAnswer answerId={`template:${slug}`} excerpt={`${v.title}: ${v.description}`} triggerClass={s.reportLink} triggerLabel="Report this template" subject="page" />
          </div>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", "@id": abs(`${path}#page`), url: abs(path), name: `${v.title} website template`, description: v.description, inLanguage: "en", isPartOf: { "@type": "CollectionPage", name: "Keplar website templates", url: abs("/templates") }, publisher: { "@id": abs("/#organization") }, ...(v.publishedAt ? { datePublished: v.publishedAt.slice(0, 10) } : {}) }} />
      <JsonLd data={breadcrumbs([{ name: "Templates", path: "/templates" }, { name: v.title, path }])} />
    </div>
  );
}
