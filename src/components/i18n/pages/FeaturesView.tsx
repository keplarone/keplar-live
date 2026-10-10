import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import s from "@/components/landing/Features.module.css";
import { CHAPTERS, featureCounts } from "@/lib/features";
import { breadcrumbs } from "@/lib/seo-graph";
import { getMessages } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/i18n/routing";
import { rich } from "@/lib/i18n/format";
import { TwoTone } from "@/components/page/TwoTone";

/** /features in any locale. Feature data and status come from src/lib/features.ts; names and lines from the marketing catalog. */
export async function FeaturesView({ locale = "en" }: { locale?: string }) {
  const m = await getMessages(locale, "marketing");
  const p = m.featuresPage;
  const n = featureCounts();
  const L = (href: string) => localizedPath(href, locale);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.kicker}>{p.kicker}</p>
        <h1 className={s.title}><TwoTone text={p.title} /></h1>
        <p className={s.lead}>{rich(p.lead, { b: (t) => <b>{t}</b> }, { live: n.live, beta: n.beta, soon: n.soon })}</p>
        <nav className={s.jump} aria-label={p.sections}>{CHAPTERS.map((c) => <a key={c.id} href={`#${c.id}`}><b>{c.n}</b>{m.chapters.list[c.id]?.label ?? c.label}</a>)}</nav>
      </header>
      {CHAPTERS.map((c) => (
        <section key={c.id} id={c.id} className={s.group} aria-labelledby={`f-${c.id}`}>
          <div className={s.gHead}>
            <p className={s.num}>{c.n}</p>
            <h2 id={`f-${c.id}`} className={s.h2}>{m.chapters.list[c.id]?.label ?? c.label}</h2>
            <p className={s.gLede}>{m.chapters.list[c.id]?.lede ?? c.lede}</p>
          </div>
          <table className={s.table}>
            <thead className="visually-hidden"><tr><th>{p.thFeature}</th><th>{p.thWhat}</th><th>{p.thStatus}</th></tr></thead>
            <tbody>
              {c.features.map((f) => {
                const t = m.chapters.items[f.id] ?? f;
                return (
                  <tr key={f.id} data-s={f.status}>
                    <th scope="row">{f.status === "soon" ? t.name : <Link href={L(f.href)}>{t.name}</Link>}</th>
                    <td>{t.line}{f.note ? <span className={s.note}> {t.note ?? f.note}</span> : null}</td>
                    <td className={s.status} data-s={f.status}>{m.status[f.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      <p className={s.foot}>{rich(p.foot, { changelog: (t) => <Link href="/changelog">{t}</Link>, roadmap: (t) => <Link href={L("/roadmap")}>{t}</Link>, demo: (t) => <Link href={L("/#demo")}>{t}</Link> })}</p>
      <JsonLd data={breadcrumbs([{ name: p.crumb, path: L("/features") }])} />
    </div>
  );
}
