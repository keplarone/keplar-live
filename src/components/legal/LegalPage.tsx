import Link from "next/link";
import { DataFlow } from "./DataFlow";
import { LegalToc } from "./LegalToc";
import { Placeholder, ReviewNote } from "./ReviewNote";
import { reviewItems, type LegalBlock, type LegalDoc } from "./content/types";
import s from "./Legal.module.css";
import { TwoTone } from "@/components/page/TwoTone";

/** Renders `[[text]]` as a visible placeholder; everything else is plain text. */
function rich(text: string): React.ReactNode {
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return parts.length === 1 ? text : parts.map((t, i) => (i % 2 ? <Placeholder key={i}>[{t}]</Placeholder> : t));
}

function Block({ block, reviewId }: { block: LegalBlock; reviewId?: string }) {
  switch (block.type) {
    case "p":
      return <p className={s.p}>{rich(block.text)}</p>;
    case "list":
      return (
        <ul className={s.list}>
          {block.items.map((it) => {
            // "Lead. Rest" items render the lead in medium weight.
            const m = it.match(/^([^.]{2,48}\.)\s(.+)$/);
            return <li key={it}>{m && /^[A-Z]/.test(m[1]) && it.length > 60 ? <><strong>{m[1]}</strong> {m[2]}</> : it}</li>;
          })}
        </ul>
      );
    case "review":
      return <ReviewNote id={reviewId}>{block.text}</ReviewNote>;
    case "flow":
      return <DataFlow />;
    case "email":
      return (
        <p className={s.p}>
          {block.label}{" "}
          <a className={s.email} href={`mailto:${block.email}`}>{block.email}</a>
        </p>
      );
    case "compare":
      return (
        <div className={s.tableWrap} role="region" aria-label={block.caption} tabIndex={0}>
          <table className={s.table}>
            <caption className="visually-hidden">{block.caption}</caption>
            <thead>
              <tr>
                <td />
                {block.columns.map((c) => <th key={c} scope="col">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr key={r.topic}>
                  <th scope="row">{r.topic}</th>
                  {r.values.map((v, i) => <td key={i}>{v ?? <Placeholder>To be confirmed</Placeholder>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function LegalPage({ doc, sibling }: { doc: LegalDoc; sibling: { href: string; label: string } }) {
  const reviews = reviewItems(doc);
  let r = 0;
  return (
    <div className={s.page}>
      <header className={s.header} data-o="Legal header">
        <p className={s.eyebrow} data-o="Legal eyebrow">Legal</p>
        <h1 className={s.title} data-o="Legal title"><TwoTone text={doc.title} /></h1>
        {doc.subline ? <p className={s.subline}>{doc.subline}</p> : null}
        <p className={s.updated}>
          Last updated: {doc.lastUpdated ?? <Placeholder>[DATE]</Placeholder>}
        </p>
      </header>

      {reviews.length ? <div className={s.status} role="note">
        <p>
          <strong>{reviews.length === 1 ? "One detail is still to be added." : `${reviews.length} details are still to be added.`}</strong>{" "}
          The founders have not yet supplied them, so they are marked below instead of guessed.
        </p>
        <a href="#review-1" className={s.statusLink}>See what is missing</a>
      </div> : null}

      <div className={s.layout}>
        <aside className={s.tocCol}>
          <LegalToc items={doc.sections.map(({ id, title }) => ({ id, title }))} />
        </aside>

        <article className={s.body}>
          <div className={s.intro}>
            {doc.intro.map((p) => <p key={p}>{p}</p>)}
          </div>
          {doc.sections.map((sec, i) => (
            <section key={sec.id} id={sec.id} className={s.section} aria-labelledby={`${sec.id}-h`} data-still>
              <h2 id={`${sec.id}-h`} className={s.h2}>
                <span className={s.num} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span>{sec.title}</span>
                <a href={`#${sec.id}`} className={s.anchor} aria-label={`Link to ${sec.title}`}>#</a>
              </h2>
              {sec.blocks.map((b, j) => (
                <Block key={j} block={b} reviewId={b.type === "review" ? `review-${++r}` : undefined} />
              ))}
            </section>
          ))}
          <footer className={s.docFoot}>
            <Link href={sibling.href} className={s.sibling}>
              {sibling.label} <span aria-hidden="true">→</span>
            </Link>
            <p className={s.unreviewed}>
              {doc.slug !== "privacy" ? "These terms" : "This policy"} {doc.slug !== "privacy" ? "were" : "was"} drafted by the Keplar team and {doc.slug !== "privacy" ? "have" : "has"} not been reviewed by an attorney.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
