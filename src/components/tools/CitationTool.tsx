"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/app-ui/Markdown";
import { formatCitation, plainReference, type Source, type SourceType, type Style } from "@/lib/free-tools/cite";
import type { Tool } from "@/lib/free-tools/registry";
import s from "./tools.module.css";

const SHOW: Record<SourceType, string[]> = {
  book: ["authors", "title", "year", "publisher", "doi", "url", "page"],
  article: ["authors", "title", "year", "container", "volume", "issue", "pages", "doi", "page"],
  web: ["authors", "title", "year", "container", "published", "accessed", "url", "page"],
  report: ["authors", "title", "year", "publisher", "volume", "url", "accessed", "page"],
};
const LABEL: Partial<Record<string, Partial<Record<SourceType, string>>>> = {
  container: { article: "Journal", web: "Website name" },
  volume: { report: "Report number" },
};

/** Citation formatter: every keystroke reformats in the browser; nothing is sent. */
export function CitationTool({ tool }: { tool: Tool }) {
  const id = useId();
  const [v, setV] = useState<Record<string, string>>({ type: "book", style: "apa" });
  const set = (k: string, val: string) => setV((c) => ({ ...c, [k]: val }));
  const type = (v.type as SourceType) || "book";
  const style = (v.style as Style) || "apa";
  const out = useMemo(() => {
    if (!v.title?.trim()) return null;
    const src: Source = { type, authors: v.authors ?? "", title: v.title ?? "", year: v.year ?? "", container: v.container, publisher: v.publisher, volume: v.volume, issue: v.issue, pages: v.pages, doi: v.doi, url: v.url, published: v.published, accessed: v.accessed, page: v.page };
    return formatCitation(src, style);
  }, [v, type, style]);
  const [copied, setCopied] = useState(false);
  const field = (fid: string) => tool.fields.find((f) => f.id === fid)!;
  return (
    <div>
      <form className={s.form} onSubmit={(e) => e.preventDefault()}>
        <div className={s.row}>
          {(["type", "style"] as const).map((k) => (
            <div key={k} className={s.field}>
              <label htmlFor={`${id}-${k}`}>{field(k).label}</label>
              <select id={`${id}-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)}>{field(k).options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </div>
          ))}
        </div>
        {SHOW[type].map((fid) => {
          const f = field(fid);
          const label = LABEL[fid]?.[type] ?? f.label;
          return (
            <div key={fid} className={s.field}>
              <label htmlFor={`${id}-${fid}`}>{label}</label>
              {f.kind === "textarea" ? (
                <textarea id={`${id}-${fid}`} rows={f.rows ?? 2} maxLength={f.max} placeholder={f.placeholder} value={v[fid] ?? ""} onChange={(e) => set(fid, e.target.value)} />
              ) : (
                <input id={`${id}-${fid}`} type={f.kind === "date" ? "date" : "text"} maxLength={f.max} placeholder={f.placeholder} value={v[fid] ?? ""} onChange={(e) => set(fid, e.target.value)} />
              )}
            </div>
          );
        })}
        <ul className={s.examples} aria-label="Examples to try">
          {tool.examples.map((ex) => <li key={ex.title}><button type="button" className={s.chip} onClick={() => setV({ type: "book", style: "apa", ...ex.input })}>Try: {ex.title}</button></li>)}
        </ul>
        <p className={s.note}>Formatted in your browser from the style rules. Nothing you type is sent anywhere.</p>
      </form>
      {out ? (
        <section className={s.result} aria-live="polite" aria-label="Formatted citation">
          <p className={s.meta}><span>Reference list entry</span></p>
          <div className={s.citation}><Markdown source={out.reference} /></div>
          <p className={s.meta}><span>In-text citation</span></p>
          <p className={s.citation}>{out.inText}</p>
          {out.missing.length ? <p className={s.note}>This style usually also needs: {out.missing.join(", ")}.</p> : null}
          <div className={s.actions}>
            <Button type="button" variant="secondary" size="sm" state={copied ? "done" : undefined} onClick={async () => { try { await navigator.clipboard.writeText(`${plainReference(out)}\n${out.inText}`); setCopied(true); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy both"}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
