"use client";

import { useState, type CSSProperties } from "react";
import { agreementLine } from "@/lib/rich-answer/parse";
import type { AgreementCounts, RichAnswer as RichData, RichBlock } from "@/lib/rich-answer/types";
import s from "./RichAnswer.module.css";

function Favicon({ domain }: { domain: string }) {
  const [on, setOn] = useState(true);
  const letter = domain.replace(/^www\./, "").slice(0, 1).toUpperCase();
  return (
    <span className={s.mark} aria-hidden="true">
      {on ? (
        // Same-origin proxy of that site's favicon. next/image can't take an open set of citation hosts; a miss falls back to the initial.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/favicon?domain=${encodeURIComponent(domain)}`} alt="" width={16} height={16} onError={() => setOn(false)} />
      ) : (
        letter
      )}
    </span>
  );
}

function Ranked({ block, i }: { block: Extract<RichBlock, { type: "ranked" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="ranked" aria-label={block.title || "Ranking"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <ol className={s.ranked}>
        {block.items.map((it, n) => (
          <li key={`${it.rank}-${it.name}`} className={s.rankItem} style={{ "--i": n } as CSSProperties}>
            <span className={s.rank}>{it.rank}</span>
            <div>
              <div className={s.nameRow}>
                <h3 className={s.name}>{it.name}</h3>
                {it.maker ? <span className={s.maker}>{it.maker}</span> : null}
                {it.score ? <span className={s.score}>{it.score}</span> : null}
              </div>
              <p className={s.why}>{it.why}</p>
              {it.tags.length ? (
                <ul className={s.tags} aria-label="Tags">
                  {it.tags.map((t) => (
                    <li key={t} className={s.tag}>{t}</li>
                  ))}
                </ul>
              ) : null}
              {it.split?.length ? (
                <details className={s.differ}>
                  <summary>Differed</summary>
                  <ul className={s.voices}>
                    {it.split.map((v) => (
                      <li key={v.model}>
                        <span className={s.who}>{v.model}</span>
                        {v.said}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <p className={s.note}>{block.note}</p>
    </section>
  );
}

function Compare({ block, i }: { block: Extract<RichBlock, { type: "compare" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="compare" aria-label={block.title || "Comparison"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <div className={s.scroll} tabIndex={0} role="region" aria-label={block.title || "Comparison table"}>
        <table className={s.table}>
          <caption className="visually-hidden">{block.title || "Comparison"}</caption>
          <thead>
            <tr>
              <th scope="col" />
              {block.columns.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, n) => (
                  <td key={n}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cards({ block, i }: { block: Extract<RichBlock, { type: "cards" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="cards" aria-label={block.title || "Cards"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <ul className={s.cards}>
        {block.items.map((it, n) => (
          <li key={it.title} className={s.card} style={{ "--i": n } as CSSProperties}>
            {it.tag ? <span className={s.tag}>{it.tag}</span> : null}
            <h3>{it.title}</h3>
            <p className={s.body}>{it.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Timeline({ block, i }: { block: Extract<RichBlock, { type: "timeline" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="timeline" aria-label={block.title || "Timeline"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <ol className={s.timeline}>
        {block.items.map((it, n) => (
          <li key={`${it.when}-${it.title}`} className={s.event} style={{ "--i": n } as CSSProperties}>
            <span className={s.dot} aria-hidden="true" />
            <div>
              <h3>{it.title}</h3>
              <p className={s.maker}>{it.when}</p>
              {it.body ? <p className={s.body}>{it.body}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Steps({ block, i }: { block: Extract<RichBlock, { type: "steps" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="steps" aria-label={block.title || "Steps"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <ol className={s.steps}>
        {block.items.map((it, n) => (
          <li key={it.title} className={s.step} style={{ "--i": n } as CSSProperties}>
            <span className={s.stepN}>{n + 1}</span>
            <div>
              <h3>{it.title}</h3>
              <p className={s.body}>{it.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProsCons({ block, i }: { block: Extract<RichBlock, { type: "proscons" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="proscons" aria-label={block.title || "Pros and cons"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <div className={s.proscons}>
        <div className={s.side}>
          <h3>Pros</h3>
          <ul>
            {block.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className={s.side}>
          <h3>Cons</h3>
          <ul>
            {block.cons.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stats({ block, i }: { block: Extract<RichBlock, { type: "stats" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="stats" aria-label={block.title || "Figures"}>
      {block.title ? <h3 className={s.title}>{block.title}</h3> : null}
      <dl className={s.stats}>
        {block.items.map((it) => (
          <div key={it.label} className={s.stat}>
            <dt>{it.label}</dt>
            <dd>
              {it.value}
              {it.note ? <small>{it.note}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Callout({ block, i }: { block: Extract<RichBlock, { type: "callout" }>; i: number }) {
  return (
    <aside className={s.callout} style={{ "--i": i } as CSSProperties} data-rich-block="callout">
      <p>{block.text}</p>
    </aside>
  );
}

function Sources({ block, i }: { block: Extract<RichBlock, { type: "sources" }>; i: number }) {
  return (
    <section className={s.block} style={{ "--i": i } as CSSProperties} data-rich-block="sources" aria-label="Sources">
      <ul className={s.sources}>
        {block.items.map((it) => (
          <li key={it.url}>
            <a href={it.url} target="_blank" rel="noreferrer noopener">
              <Favicon domain={it.domain} />
              <span>{it.title}</span>
              <span className={s.domain}>{it.domain}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Block({ block, i }: { block: RichBlock; i: number }) {
  switch (block.type) {
    case "ranked":
      return <Ranked block={block} i={i} />;
    case "compare":
      return <Compare block={block} i={i} />;
    case "cards":
      return <Cards block={block} i={i} />;
    case "timeline":
      return <Timeline block={block} i={i} />;
    case "steps":
      return <Steps block={block} i={i} />;
    case "proscons":
      return <ProsCons block={block} i={i} />;
    case "stats":
      return <Stats block={block} i={i} />;
    case "callout":
      return <Callout block={block} i={i} />;
    case "sources":
      return <Sources block={block} i={i} />;
  }
}

export function RichSkeleton() {
  return (
    <div className={s.skeleton} role="status" aria-live="polite" data-rich-skeleton="">
      <span className="visually-hidden">Preparing the structured part of the answer</span>
      <span className={s.bar} />
      <span className={s.bar} />
      <span className={s.bar} />
    </div>
  );
}

export function RichAnswer({ data, consensus }: { data: RichData; consensus?: AgreementCounts }) {
  const line = agreementLine(consensus);
  if (!data.blocks.length && !line) return null;
  return (
    <div className={s.stack} data-rich="">
      {line ? <p className={s.agree} data-agreement="">{line}</p> : null}
      {data.blocks.map((b, i) => (
        <Block key={i} block={b} i={i} />
      ))}
    </div>
  );
}

