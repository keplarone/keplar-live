import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { TemplateThumb } from "@/components/templates/TemplateThumb";
import s from "@/components/templates/Templates.module.css";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { CATEGORY_LABEL } from "@/lib/templates/constants";
import { listGallery, type GalleryTemplate } from "@/lib/templates/store";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic"; // a withdrawn or hidden template must disappear at once

export const metadata: Metadata = pageMeta("/templates", "Website templates you can remix", "Start from a real website and describe what to change: Keplar's starters and sites their owners chose to share. Remix copies the pages into your workspace.");

function Card({ t }: { t: GalleryTemplate }) {
  return (
    <li className={s.card}>
      <TemplateThumb slug={t.slug} title={t.title} />
      <div className={s.cardBody}>
        <h3 className={s.cardTitle}><Link href={`/templates/${t.slug}`}>{t.title}</Link></h3>
        <p className={s.meta}>{t.description}</p>
        <div className={s.chips}>
          <span className={s.chip}>{CATEGORY_LABEL[t.category]}</span>
          <span className={s.chip}>{t.pages.length} page{t.pages.length === 1 ? "" : "s"}</span>
          {t.remixes > 0 ? <span className={s.chip}>{t.remixes} remix{t.remixes === 1 ? "" : "es"}</span> : null}
          {t.likes > 0 ? <span className={s.chip}>{t.likes} like{t.likes === 1 ? "" : "s"}</span> : null}
        </div>
      </div>
    </li>
  );
}

export default async function Templates() {
  const all = await listGallery().catch(() => []);
  const starters = all.filter((t) => t.kind === "starter");
  const community = all.filter((t) => t.kind === "community");
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Templates</p>
      <h1 className={s.title}><TwoTone text={"Start from a real site. Change it by describing it."} /></h1>
      <p className={s.lead}>Pick a template, press Remix, and Keplar copies the pages into your workspace and opens Create so you can say what to change: your name, words, colors, photos, pages.</p>
      <p className={s.notice}>Remix copies pages, text, layout and styles only. Form messages, contacts, bookings, orders, members and uploaded photos never come with a template, and forms in your copy go to your own inbox.</p>

      <h2 className={s.h2}>Keplar starters</h2>
      <p className={s.notice}>Complete multi-page sites made by Keplar&apos;s template builder, not by the AI model: instant and free, and checked to build, lint and pass Keplar&apos;s safety scan. The text in them is placeholder copy for you to replace.</p>
      <ul className={s.grid}>{starters.map((t) => <Card key={t.slug} t={t} />)}</ul>

      <h2 className={s.h2}>Community gallery</h2>
      <p className={s.notice}>Sites whose owners chose to share them. Each is a snapshot the owner approved, checked for contact details and unsafe content, and the owner can withdraw it at any time. Keplar reviews reports by hand.</p>
      {community.length ? (
        <ul className={s.grid}>{community.map((t) => <Card key={t.slug} t={t} />)}</ul>
      ) : (
        <p className={s.empty}>No community templates yet. To share one of your sites, open Projects in your account and choose Share as template.</p>
      )}

      <div className={s.actions}>
        <Link className={s.btn} href="/app/create?utm_source=templates&utm_medium=index">Build something from scratch</Link>
        <Link className={s.btn} href="/showcase">See the curated Create showcase</Link>
      </div>
      <JsonLd data={breadcrumbs([{ name: "Templates", path: "/templates" }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar website templates", url: abs("/templates"), inLanguage: "en", mainEntity: { "@type": "ItemList", itemListElement: all.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/templates/${t.slug}`), name: t.title })) } }} />
    </div>
  );
}
