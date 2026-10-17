import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Faq } from "@/components/sections/Faq";
import type { Block, Bullet, ComparePage } from "@/lib/compare";
import { brand, tryHref } from "@/lib/site";
import s from "./compare.module.css";
import { TwoTone } from "@/components/page/TwoTone";

function Bullets({ items, ordered }: { items: Bullet[]; ordered?: boolean }) {
  const L = ordered ? "ol" : "ul";
  return (
    <L className={ordered ? s.ol : s.ul}>
      {items.map((it) => (
        <li key={(it.b ?? "") + it.text}>
          {it.b ? <strong>{it.b}</strong> : null} {it.text}
        </li>
      ))}
    </L>
  );
}

function renderBlock(b: Block, i: number) {
  switch (b.t) {
    case "p":
      return <p key={i} className={s.p}>{b.text}</p>;
    case "disclosure":
      return <p key={i} className={s.disclosure}>{b.text}</p>;
    case "short":
      return (
        <div key={i} className={s.short}>
          <p className={s.shortLabel}>Short version</p>
          <p className={s.shortText}>{b.text}</p>
        </div>
      );
    case "h2":
      return <h2 key={i} className={s.h2}>{b.text}</h2>;
    case "list":
      return (
        <section key={i} className={s.block}>
          {b.title ? <h2 className={s.h2}>{b.title}</h2> : null}
          <Bullets items={b.items} ordered={b.ordered} />
        </section>
      );
    case "table":
      return (
        <div key={i} className={s.tableWrap} role="region" aria-label={b.caption} tabIndex={0}>
          <table className={s.table}>
            <caption className="visually-hidden">{b.caption}</caption>
            <thead>
              <tr>
                {b.head.map((h, k) => (
                  <th key={k} scope="col">{h || <span className="visually-hidden">Feature</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r[0]}>
                  <th scope="row">{r[0]}</th>
                  {r.slice(1).map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "picks":
      return (
        <section key={i} className={s.picks} aria-label="Who should pick which">
          {b.groups.map((g) => (
            <div key={g.title}>
              <h2 className={s.h3}>{g.title}</h2>
              <ul className={s.ul}>
                {g.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </section>
      );
    case "tool":
      return (
        <section key={i} className={s.tool}>
          <h3 className={s.h3}>{b.name}</h3>
          <p className={s.p}>{b.text}</p>
          <Bullets items={b.bullets} />
        </section>
      );
  }
}

/** Shared, typographic comparison template: table, disclosure-row FAQ, dated sources. */
export function CompareTemplate({ page, related, also = [] }: { page: ComparePage; related?: ComparePage[]; also?: { path: string; label: string }[] }) {
  return (
    <article className={s.page}>
      <header className={s.header}>
        <p className={s.label}>{page.label}</p>
        <h1 className={s.h1}><TwoTone text={page.h1} /></h1>
        <p className={s.checked}>Last checked: <time>{page.lastChecked}</time></p>
      </header>

      <div className={s.body}>{page.blocks.map(renderBlock)}</div>

      <div className={s.faq}>
        <Faq title="FAQ" entries={page.faq} />
      </div>

      <div className={s.cta}>
        <ButtonLink href={tryHref} arrow size="lg">Try {brand.companyName} free</ButtonLink>
        <ButtonLink href="/pricing" variant="secondary" size="lg">See plans</ButtonLink>
      </div>

      <section className={s.sources} aria-labelledby="sources-title">
        <h2 id="sources-title" className={s.h3}>Sources <span className={s.sourcesDate}>checked {page.lastChecked}</span></h2>
        {page.sourcesNote ? <p className={s.sourcesNote}>{page.sourcesNote}</p> : null}
        <ul>
          {page.sources.map((src) => (
            <li key={src.label}>
              {src.url ? (
                <a href={src.url} rel="noopener noreferrer nofollow" target="_blank">{src.label}</a>
              ) : (
                src.label
              )}
            </li>
          ))}
        </ul>
      </section>

      {related?.length || also.length ? (
        <nav className={s.related} aria-label="Other comparisons">
          {related?.map((r) => (
            <Link key={r.path} href={r.path}>{r.h1} →</Link>
          ))}
          {also.map((r) => (
            <Link key={r.path} href={r.path}>{r.label} →</Link>
          ))}
        </nav>
      ) : null}
    </article>
  );
}
