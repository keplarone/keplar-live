import { breadcrumbs } from "@/lib/seo-graph";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { HELP, allHelpItems } from "@/lib/support/help";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import hero from "@/components/page/RoutePlaceholder.module.css";
import s from "@/components/support/Help.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta("/help", "Help", "Answers about using Keplar, your account and plan, your data, connected apps, the desktop app and reporting an answer.");

export default function HelpPage() {
  const graph = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: allHelpItems().map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a.join(" ") } })) };
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Help", path: "/help" }])} />
      <JsonLd data={graph} />
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label} data-o="RoutePlaceholder label">Help</p>
          <h1 className={hero.title} data-o="RoutePlaceholder title"><TwoTone text={"How can we help?"} /></h1>
          <p className={hero.lede}>
            Answers about what Keplar does today. Can&apos;t find yours? <Link href="/contact">Contact the team</Link> or email {brand.feedbackEmail}. Live service checks are on the <Link href="/status">Status</Link> page.
          </p>
        </div>
      </header>
      <div className={s.wrap}>
        <ul className={s.tiles} aria-label="Help topics">
          {HELP.map((g) => (
            <li key={g.id}>
              <a className={s.tile} href={`#${g.id}`}>
                <span className={s.tileTitle}>{g.title}</span>
                <span className={s.tileCount}>{g.items.length} {g.items.length === 1 ? "question" : "questions"}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className={s.body}>
          <nav className={s.rail} aria-label="On this page">
            <h2>Topics</h2>
            <ol>{HELP.map((g) => <li key={g.id}><a href={`#${g.id}`}>{g.title}</a></li>)}</ol>
          </nav>
          <div className={s.groups}>
            {HELP.map((g) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className={s.group}>
                <div className={s.groupHead}>
                  <h2 id={`${g.id}-h`} className={s.groupTitle}>{g.title}</h2>
                </div>
                {g.items.map((i) => (
                  <details key={i.id} id={i.id} className={s.q}>
                    <summary>{i.q}</summary>
                    <div className={s.a}>
                      {i.a.map((p, k) => <p key={k}>{p}</p>)}
                    </div>
                  </details>
                ))}
              </section>
            ))}
          </div>
        </div>
        <p className={s.note}>Keplar can be wrong. This page is general information, not legal, medical or financial advice.</p>
      </div>
    </>
  );
}
