import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import s from "@/components/landing/Features.module.css";
import { ALL_FEATURES, CHAPTERS } from "@/lib/features";
import { releases } from "@/lib/kb/changelog";
import { breadcrumbs } from "@/lib/seo-graph";
import { getMessages } from "@/lib/i18n/server";
import { localeInfo } from "@/lib/i18n/locales";
import { localizedPath } from "@/lib/i18n/routing";
import { rich } from "@/lib/i18n/format";
import { TwoTone } from "@/components/page/TwoTone";

/** /roadmap in any locale. Open work on beta features (plain statements, no dates) lives in the marketing catalog. */
export async function RoadmapView({ locale = "en" }: { locale?: string }) {
  const m = await getMessages(locale, "marketing");
  const r = m.roadmap;
  const lang = localeInfo(locale).lang;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "en" ? "en-US" : lang, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const L = (href: string) => localizedPath(href, locale);
  const building = ALL_FEATURES.filter((f) => f.status === "soon");
  const chapterOf = (id: string) => {
    const c = CHAPTERS.find((x) => x.features.some((f) => f.id === id));
    return c ? (m.chapters.list[c.id]?.label ?? c.label) : "";
  };
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.kicker} data-o="Features kicker">{r.kicker}</p>
        <h1 className={s.title}><TwoTone text={r.title} /></h1>
        <p className={s.lead}>{rich(r.lead, { changelog: (t) => <Link href="/changelog">{t}</Link>, features: (t) => <Link href={L("/features")}>{t}</Link> })}</p>
      </header>

      {/* Only while something in the feature registry is marked "soon": no empty table. */}
      {building.length ? (
        <section className={s.group} aria-labelledby="r-now">
          <div><p className={s.num}>{r.nowNum}</p><h2 id="r-now" className={s.h2}>{r.nowTitle}</h2><p className={s.gLede}>{r.nowLede}</p></div>
          <table className={s.table}><tbody>
            {building.map((f) => <tr key={f.id} data-s="soon"><th scope="row">{m.chapters.items[f.id]?.name ?? f.name}</th><td>{m.chapters.items[f.id]?.line ?? f.line}</td><td className={s.status} data-s="soon">{chapterOf(f.id)}</td></tr>)}
          </tbody></table>
        </section>
      ) : null}

      <section className={s.group} aria-labelledby="r-beta">
        <div><p className={s.num}>{r.nextNum}</p><h2 id="r-beta" className={s.h2}>{r.nextTitle}</h2><p className={s.gLede}>{r.nextLede}</p></div>
        <table className={s.table}><tbody>
          {r.finishing.map((g) => <tr key={g.feature} data-s="beta"><th scope="row">{g.feature}</th><td>{g.items.join(" · ")}</td><td className={s.status} data-s="beta">{m.status.beta}</td></tr>)}
        </tbody></table>
      </section>

      <section className={s.group} aria-labelledby="r-done">
        <div><p className={s.num}>{r.doneNum}</p><h2 id="r-done" className={s.h2}>{r.doneTitle}</h2><p className={s.gLede}>{r.doneLede}{locale === "en" ? null : ` ${r.englishNote}`}</p></div>
        <table className={s.table}><tbody>
          {releases.slice(0, 4).map((x) => <tr key={x.id} data-s="live"><th scope="row"><Link href={`/changelog#${x.id}`} hrefLang="en">{x.title}</Link></th><td lang="en">{x.summary}</td><td className={s.status} data-s="live">{fmt(x.date)}</td></tr>)}
        </tbody></table>
      </section>

      <p className={s.foot}>{rich(r.foot, { feedback: (t) => <Link href="/feedback">{t}</Link>, security: (t) => <Link href="/security">{t}</Link> })}</p>
      <JsonLd data={breadcrumbs([{ name: r.kicker, path: L("/roadmap") }])} />
    </div>
  );
}
