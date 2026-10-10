import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { referralConfig } from "@/lib/referrals/config";
import s from "@/components/developers/Developers.module.css";
import { localeMetadata } from "@/lib/i18n/seo";
import { getMessages } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/format";
import { localeInfo } from "@/lib/i18n/locales";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "developers");
}

const TAGS = ["REST · SSE", "script · iframe", "Business", "credits"];
const ANCHORS = ["#quickstart", "#embed", "#teams", "#referrals"];
const REF_IDS = ["tiers", "quickstart", "ask", "stream", "embed", "teams", "errors", "security", "roadmap"];

/**
 * Developers in a locale: what the API, widget, Teams and referrals are, and how to start. The technical reference (code samples,
 * fields, limits tables, error codes) is the same in every language and stays on the English page, linked section by section.
 */
export default async function LocaleDevelopers({ params }: P) {
  const { locale } = await params;
  const d = (await getMessages(locale, "marketing")).developers;
  const ref = referralConfig();
  const n = ref.referrerCredits.toLocaleString(localeInfo(locale).lang);
  return (
    <div className={s.page}>
      <header className={s.hero}>
        <p className={s.kicker}><span>{d.kicker}</span><span>API v1</span><span>Embed</span><span>Teams</span></p>
        <h1 className={s.title}>{d.title}</h1>
        <p className={s.lede}>{d.lede}</p>
        <div className={s.endpoint} aria-label={d.endpoint} dir="ltr"><span className={s.method}>POST</span>{site.url.replace(/^https?:\/\//, "")}/api/v1/ask</div>
        <div className={s.heroActions}>
          <Link className={s.btn} href="/account#api">{d.getKey}</Link>
          <Link className={`${s.btn} ${s.btnGhost}`} href="/account#embed">{d.widget}</Link>
          <a className={`${s.btn} ${s.btnGhost}`} href="/api/v1/openapi.json">{d.spec}</a>
        </div>
      </header>

      <nav className={s.products} aria-label={d.platform}>
        {d.products.map((p, i) => (
          <Link key={p.name} className={s.product} href={`/developers${ANCHORS[i]}`} hrefLang="en">
            <span className={s.productTag}>{TAGS[i]}</span>
            <p className={s.productName}>{p.name}</p>
            <p className={s.productText}>{fmt(p.text, { n })}</p>
          </Link>
        ))}
      </nav>

      <section className={s.section} aria-labelledby="ref-h" style={{ marginTop: "var(--s-12)" }}>
        <div className={s.sectionHead}>
          <h2 id="ref-h" className={s.h2}>{d.refTitle}</h2>
          <p className={s.lede}>{d.refLede}</p>
        </div>
        <ul style={{ display: "grid", gap: "var(--s-2)", paddingInlineStart: "1.2em", margin: 0 }}>
          {d.sections.map((t, i) => (
            <li key={REF_IDS[i]}><Link href={`/developers#${REF_IDS[i]}`} hrefLang="en">{t}</Link></li>
          ))}
        </ul>
        <p><Link className={s.btn} href="/developers" hrefLang="en">{d.refLink}</Link></p>
      </section>
    </div>
  );
}
