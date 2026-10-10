import Link from "next/link";
import type { ReactNode } from "react";
import { parseInline, type Node } from "@/lib/kb/md";
import { CopyButton } from "./CopyButton";
import s from "./kb.module.css";

export function Inline({ text }: { text: string }): ReactNode {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.k === "code") return <code key={i}>{t.v}</code>;
        if (t.k === "b") return <strong key={i}><Inline text={t.v} /></strong>;
        if (t.k === "i") return <em key={i}>{t.v}</em>;
        if (t.k === "a") {
          if (t.href.startsWith("/")) return <Link key={i} href={t.href}>{t.v}</Link>;
          if (t.href.startsWith("mailto:")) return <a key={i} href={t.href}>{t.v}</a>;
          return <a key={i} href={t.href} rel="noopener noreferrer" target="_blank">{t.v}</a>;
        }
        return <span key={i}>{t.v}</span>;
      })}
    </>
  );
}

const CALLOUT = { note: "Note", tip: "Tip", warning: "Heads up" } as const;

/** Server-rendered Markdown AST. The only client code on the page is each code block's copy button. */
export function Markdown({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "h2": return <h2 key={i} id={n.id}><a className={s.anchor} href={`#${n.id}`}>{n.text}</a></h2>;
          case "h3": return <h3 key={i} id={n.id}><a className={s.anchor} href={`#${n.id}`}>{n.text}</a></h3>;
          case "p": return <p key={i}><Inline text={n.text} /></p>;
          case "ul": return <ul key={i}>{n.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ul>;
          case "ol": return <ol key={i}>{n.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ol>;
          case "quote": return <blockquote key={i}><Inline text={n.text} /></blockquote>;
          case "hr": return <hr key={i} />;
          case "callout": return <div key={i} className={s.callout} data-kind={n.kind} role="note"><b>{CALLOUT[n.kind]}</b><Inline text={n.text} /></div>;
          case "code":
            return (
              <figure key={i} className={s.codeBlock} style={{ margin: 0 }}>
                <div className={s.codeHead}><span>{n.title ?? n.lang}</span><CopyButton text={n.code} label={n.title ?? "code"} /></div>
                <pre tabIndex={0}><code>{n.code}</code></pre>
              </figure>
            );
          case "table":
            return (
              <div key={i} className={s.tableWrap} tabIndex={0} role="region" aria-label="Table">
                <table className={s.table}>
                  <thead><tr>{n.head.map((c, j) => <th key={j} scope="col"><Inline text={c} /></th>)}</tr></thead>
                  <tbody>{n.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row"><Inline text={c} /></th> : <td key={k}><Inline text={c} /></td>))}</tr>)}</tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
