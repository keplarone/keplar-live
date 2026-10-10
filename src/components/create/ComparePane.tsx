"use client";
import { useEffect, useRef, useState } from "react";
import { diffFiles, hunks, lineDiff } from "@/lib/site-builder/diff";
import { api } from "./api";
import s from "./create.module.css";
import b from "./builder.module.css";

type V = { n: number; summary: string; kind: string };
const WORD = { added: "added", removed: "removed", changed: "changed", same: "same" } as const;

/** Compare any two versions of the site, file by file, with the changed lines. Reads the saved versions; changes nothing. */
export function ComparePane({ siteId, versions, head, initialFrom, onClose }: { siteId: string; versions: V[]; head: number; initialFrom: number; onClose: () => void }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(head);
  const cache = useRef(new Map<number, Record<string, string>>());
  const [files, setFiles] = useState<{ a: Record<string, string>; b: Record<string, string> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const get = async (n: number) => {
          const hit = cache.current.get(n);
          if (hit) return hit;
          const r = await api<{ files: Record<string, string> }>(`/api/sites/${siteId}/versions?n=${n}`);
          cache.current.set(n, r.files);
          return r.files;
        };
        const [a, c] = await Promise.all([get(from), get(to)]);
        if (live) { setFiles({ a, b: c }); setErr(null); }
      } catch (e) {
        if (live) { setFiles(null); setErr(e instanceof Error ? e.message : "Couldn't load those versions."); }
      }
    })();
    return () => { live = false; };
  }, [siteId, from, to]);
  const diff = files ? diffFiles(files.a, files.b) : [];
  const changed = diff.filter((d) => d.status !== "same");
  const totals = changed.reduce((t, d) => ({ plus: t.plus + d.plus, minus: t.minus + d.minus }), { plus: 0, minus: 0 });
  const opts = versions.map((v) => <option key={v.n} value={v.n}>v{v.n}{v.n === head ? " (current)" : ""} · {(v.summary || v.kind).slice(0, 40)}</option>);
  const detail = files && open ? hunks(lineDiff(files.a[open] ?? "", files.b[open] ?? "")) : null;
  return (
    <section className={b.card} data-testid="compare" aria-label="Compare versions">
      <div className={b.row}>
        <label className={b.field}><span>From</span><select className={s.input} aria-label="From version" value={from} onChange={(e) => { setFrom(Number(e.target.value)); setOpen(null); }}>{opts}</select></label>
        <label className={b.field}><span>To</span><select className={s.input} aria-label="To version" value={to} onChange={(e) => { setTo(Number(e.target.value)); setOpen(null); }}>{opts}</select></label>
        <span className={b.grow} />
        <button type="button" className={s.iconBtn} onClick={onClose}>Close</button>
      </div>
      {err ? <p role="alert" className={s.muted}>{err}</p> : null}
      {!files && !err ? <p className={s.muted} role="status">Loading both versions…</p> : null}
      {files && from === to ? <p className={s.muted} data-testid="compare-same">Same version on both sides. Pick two different ones.</p> : null}
      {files && from !== to ? (
        changed.length === 0 ? <p className={s.muted} data-testid="compare-none">No differences: every file is identical.</p> : (
          <>
            <p data-testid="compare-total" className={b.hint}>{changed.length} file{changed.length === 1 ? "" : "s"} differ · +{totals.plus} / −{totals.minus} lines (v{from} → v{to})</p>
            <ul className={b.list}>
              {changed.map((d) => (
                <li key={d.path} className={b.item}>
                  <div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{d.path}</strong><small>{WORD[d.status]} · +{d.plus} / −{d.minus}</small></div>
                  {d.status === "changed" ? <button type="button" className={s.iconBtn} aria-expanded={open === d.path} onClick={() => setOpen(open === d.path ? null : d.path)}>{open === d.path ? "Hide lines" : "Show lines"}</button> : null}
                </li>
              ))}
            </ul>
            {detail ? (
              <pre className={b.code} tabIndex={0} aria-label={`Changed lines in ${open}`} data-testid="compare-lines">
                {detail.rows.map((r, i) => (
                  <div key={i} style={r.t === "+" ? { fontWeight: 700, background: "color-mix(in srgb, var(--c-ink) 10%, transparent)" } : r.t === "-" ? { opacity: 0.6, textDecoration: "line-through" } : r.t === "…" ? { opacity: 0.4 } : undefined}>{r.t === "…" ? "⋯" : `${r.t} ${r.s}`}</div>
                ))}
                {detail.truncated ? <div style={{ opacity: 0.6 }}>… more changes not shown. Use Code or Download ZIP to see everything.</div> : null}
              </pre>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}
