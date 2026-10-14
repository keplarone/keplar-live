"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { tryHref } from "@/lib/site";
import { useClientText, useCommon, useLocale } from "@/lib/i18n/client";
import { localizedPath } from "@/lib/i18n/routing";
import { fmt } from "@/lib/i18n/format";
import s from "@/components/sky/Sky.module.css";

const FAMILIES = ["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"];

/** One question, then the app (nothing is sent from this page): the hero's single ink action. */
function HeroPrompt() {
  const t = useClientText().home;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const go = () => {
    if (sending) return;
    setSending(true);
    const text = (ref.current?.value ?? "").trim().slice(0, 600);
    window.location.href = text ? `${tryHref}#q=${encodeURIComponent(text)}` : tryHref;
  };
  return (
    <form className={s.composer} onSubmit={(e) => { e.preventDefault(); go(); }}>
      <label htmlFor="hero-q" className="visually-hidden">{t.questionLabel}</label>
      <textarea
        ref={ref}
        id="hero-q"
        className={`${s.input} type-input`}
        rows={1}
        maxLength={600}
        placeholder={t.ask}
        autoComplete="off"
        enterKeyHint="go"
        spellCheck
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            go();
          }
        }}
      />
      <button type="submit" className={s.go} disabled={sending} aria-label={t.ask}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-mirror="">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

/**
 * The localized home's hero and "how it works" on UI v2 (docs/ui-v2.md), sharing the English home's styles (Sky.module.css):
 * the Keplar mark, the translated headline and lead, a question box that opens the app (the one ink action), then the story's six
 * steps as plain cards. No scene, no backdrop: the copy that the old planet story carried is all here, as text.
 */
export function LocaleHome() {
  const t = useClientText().home;
  const { credit } = useCommon();
  const locale = useLocale();
  const L = (href: string) => localizedPath(href, locale);
  return (
    <div className={s.home}>
      <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
        <KeplarSymbol size={40} className={s.mark} />
        <h1 id="hero-title" className={s.h1}>
          {t.lead.map((l, i) => <span key={i}>{l}{i < t.lead.length - 1 ? " " : null}</span>)}
        </h1>
        <p className={s.lede}>{t.sub}</p>
        <HeroPrompt />
        <p className={s.links}>
          <span>{fmt(t.builtBy, { credit })}</span>
          <a href="#demo">{t.tryDemo}</a>
          <Link href={L("/features")}>{t.everything}</Link>
        </p>
        <p className={s.fine}>{t.note}</p>
      </section>

      <section className={`${s.wrap} ${s.section}`} aria-labelledby="how-title">
        <header className={s.head} data-reveal="">
          <h2 id="how-title" className={s.h2}>{t.storyLabel}</h2>
        </header>
        <ol className={s.grid3}>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>01 · {t.index[1]}</span>
            <p className={s.stepTitle}>“{t.questionPrompt}”</p>
            <p>{t.questionCaption}</p>
          </li>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>02 · {t.kickers[1]}</span>
            <h3>{t.distributionTitle}</h3>
            <p>{t.distributionBody}</p>
            <ul className={s.chips} aria-label={t.families}>{FAMILIES.map((name) => <li key={name}>{name}</li>)}</ul>
            <p className={s.fine}>{t.routeNote}</p>
          </li>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>03 · {t.kickers[2]}</span>
            <h3>{t.responsesTitle}</h3>
            <p>{t.responsesBody}</p>
          </li>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>04 · {t.kickers[3]}</span>
            <h3>{t.agree} {t.dissent}</h3>
            <p>{t.follow}</p>
            <p className={s.fine}>{t.disagreeNote}</p>
          </li>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>05 · {t.kickers[4]}</span>
            <h3>{t.verificationTitle}</h3>
            <p>{t.verificationBody}</p>
            <ul className={s.chips}>{t.verifySteps.map((step) => <li key={step}>{step}</li>)}</ul>
          </li>
          <li className={s.card} data-reveal="">
            <span className={s.stepN}>06 · {t.kickers[5]}</span>
            <h3>{t.closingTitle}</h3>
            <p>{t.convergenceBody}</p>
            <p className={s.fine}><Link href={L("/how-it-works")}>{t.closingSecondary}</Link></p>
          </li>
        </ol>
      </section>
    </div>
  );
}
