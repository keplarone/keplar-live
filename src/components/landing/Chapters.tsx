/**
 * The landing after the hero story, kept short (minimal pass): the live demo (Ask), one compact "Everything in Keplar" list with
 * a row per remaining chapter linking to its section on /features (every feature, with honest Live / Beta / Coming soon, lives
 * there), then pricing and the closing CTA. Each overview row carries data-chapter so the space scene still follows the story.
 * Data: src/lib/features.ts.
 */
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { CtaLabel } from "@/components/ui/CtaLabel";
import { tryHref } from "@/lib/site";
import { CHAPTERS } from "@/lib/features";
import { getMessages } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/i18n/routing";
import { rich } from "@/lib/i18n/format";
import { LiveDemo } from "./LiveDemo";
import s from "./Chapters.module.css";

const ARROW = <svg className={s.arrow} viewBox="0 0 16 16" aria-hidden="true" data-mirror=""><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export async function Chapters({ beforeClose, locale = "en" }: { beforeClose?: React.ReactNode; locale?: string }) {
  const [ask, ...rest] = CHAPTERS;
  const [m, common] = await Promise.all([getMessages(locale, "marketing"), getMessages(locale, "common")]);
  const ch = m.chapters;
  const L = (href: string) => localizedPath(href, locale);
  const tx = (id: string) => ch.list[id];
  return (
    <div className={s.chapters}>
      <section id="demo" className={s.chapter} data-chapter={ask.id} aria-labelledby="ch-ask">
        <div className={s.wrap}>
          <header className={s.head}>
            <p className={s.kicker}><b>{ask.n}</b>{ch.demoKicker}</p>
            <h2 id="ch-ask" className={s.title}>{ch.demoTitle}</h2>
            <p className={s.lede}>{tx(ask.id)?.lede ?? ask.lede}</p>
          </header>
          <LiveDemo />
          <p className={s.proof}>
            {rich(ch.proof, { changelog: (t) => <Link href="/changelog">{t}</Link>, roadmap: (t) => <Link href={L("/roadmap")}>{t}</Link>, security: (t) => <Link href="/security">{t}</Link> }, { credit: common.credit })}
          </p>
        </div>
      </section>
      <section id="everything" className={s.chapter} aria-labelledby="ch-everything">
        <div className={`${s.wrap} ${s.split}`}>
          <div className={s.side}>
            <p className={s.kicker}>{m.featuresPage.kicker}</p>
            <h2 id="ch-everything" className={s.title}>{m.featuresPage.title}</h2>
          </div>
          <div className={s.main}>
            <ul className={s.list}>
              {rest.map((c) => (
                <li key={c.id} id={c.id} className={s.row} data-chapter={c.id}>
                  <Link className={s.rowIn} href={L(`/features#${c.id}`)}>
                    <span className={s.name}>{tx(c.id)?.label ?? c.label}</span>
                    <span className={s.line}>{tx(c.id)?.title ?? c.title}</span>
                    <span className={s.status} aria-hidden="true" />
                    {ARROW}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      {beforeClose}
      <section className={s.close} aria-labelledby="ch-close">
        <div className={s.wrap}>
          <h2 id="ch-close" className={s.closeTitle}>{ch.closeTitle}</h2>
          <div className={s.closeRow}>
            <ButtonLink href={tryHref} size="lg" arrow><CtaLabel tryText={ch.closeCta} openText={common.nav.open} /></ButtonLink>
            <p className={s.small}>{rich(ch.closeSmall, { link: (t) => <Link href={L("/features")}>{t}</Link> })}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
