import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { ShowcasePoster } from "@/components/create/showcase/ShowcasePoster";
import s from "@/components/create/showcase/Showcase.module.css";
import { SHOWCASE } from "@/lib/create/showcase/data";
import { abs } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { getMessages } from "@/lib/i18n/server";
import { localeInfo } from "@/lib/i18n/locales";
import { localizedPath } from "@/lib/i18n/routing";

/** /showcase in any locale. The demo items themselves (titles, lines, facts) are sample content and stay in English for now. */
export async function ShowcaseView({ locale = "en" }: { locale?: string }) {
  const sc = (await getMessages(locale, "marketing")).showcase;
  const en = locale === "en";
  const kinds = { Site: SHOWCASE.filter((i) => i.kind === "Site").length, App: SHOWCASE.filter((i) => i.kind === "App").length };
  const itemLang = en ? undefined : "en";
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <p className={s.kicker}><Link href="/app/create">Create</Link> / {sc.kicker}</p>
          <h1 className={s.title}>{sc.title}</h1>
        </div>
        <div>
          <p className={s.lead}>{sc.lead}</p>
          <p className={s.disclosure}>{sc.disclosure}</p>
          {en ? null : <p className={s.disclosure}>{sc.contentNote}</p>}
        </div>
      </header>
      <p className={s.filters}><span><b>{kinds.Site}</b> {sc.sites}</span><span><b>{kinds.App}</b> {sc.apps}</span><span><b>{new Set(SHOWCASE.map((i) => i.style)).size}</b> {sc.styles}</span><span><b>{new Set(SHOWCASE.map((i) => i.industry)).size}</b> {sc.industries}</span></p>
      <ul className={s.grid}>
        {SHOWCASE.map((it, i) => (
          <li key={it.slug} className={s.item} lang={itemLang}>
            <ShowcasePoster item={it} />
            <h2><Link href={`/showcase/${it.slug}`}>{it.title}</Link><span className={s.num}>{String(i + 1).padStart(2, "0")}</span></h2>
            <p className={s.line}>{it.line}</p>
            <p className={s.facts}><span>{it.kind}</span><span>{it.style}</span><span>{it.industry}</span><span>{it.complexity}</span></p>
          </li>
        ))}
      </ul>
      <div className={s.pager}>
        <Link href="/templates"><span>{sc.galleryKicker}</span>{sc.gallery}</Link>
        <Link href="/app/create?utm_source=showcase&utm_medium=index" style={{ textAlign: "end" }}><span>{sc.yourTurn}</span>{sc.openCreate}</Link>
      </div>
      <JsonLd data={breadcrumbs([{ name: sc.kicker, path: localizedPath("/showcase", locale) }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar Create showcase", url: abs(localizedPath("/showcase", locale)), inLanguage: localeInfo(locale).lang, mainEntity: { "@type": "ItemList", itemListElement: SHOWCASE.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/showcase/${t.slug}`), name: t.title })) } }} />
    </div>
  );
}
