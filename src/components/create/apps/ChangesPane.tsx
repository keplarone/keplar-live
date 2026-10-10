"use client";
/**
 * Changes: every version of the app with what was asked and what changed. Pick a version to see which files it touched
 * (+/− lines) and the diff of each; restore any earlier version (that makes a new version, nothing is lost).
 * Loaded only when the Changes tab is opened; the diff runs in the browser on the two versions' files.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { compareVersions, diffLines, toHunks, type FileChange } from "@/lib/app-builder/diff";
import s from "./studio.module.css";
import type { VersionMeta } from "./types";

type Files = Record<string, string>;
const cache = new Map<string, Promise<Files>>();
const filesOf = (appId: string, n: number) => {
  const k = `${appId}:${n}`;
  if (!cache.has(k)) cache.set(k, api<{ files: Files }>(`/api/sites/${appId}/versions?n=${n}`).then((r) => r.files).catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k)!;
};

const KEPT: Record<string, number> = { free: 12, lite: 15, plus: 30, pro: 50, business: 50 };

export default function ChangesPane({ appId, versions, head, plan, onRestored, onBranched }: { appId: string; versions: VersionMeta[]; head: number; plan?: string; onRestored: () => void; onBranched?: (id: string) => void }) {
  const [n, setN] = useState(head);
  const [res, setRes] = useState<{ key: string; pair?: { prev: Files; next: Files }; err?: string } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [restoreErr, setRestoreErr] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [branching, setBranching] = useState(false);
  const prevN = useMemo(() => versions.filter((v) => v.n < n).sort((a, b) => b.n - a.n)[0]?.n ?? null, [versions, n]);
  const key = `${appId}:${n}:${prevN}`;
  useEffect(() => {
    let on = true;
    Promise.all([prevN ? filesOf(appId, prevN) : Promise.resolve({} as Files), filesOf(appId, n)]).then(([prev, next]) => on && setRes({ key, pair: { prev, next } }), (e) => on && setRes({ key, err: (e as Error).message }));
    return () => {
      on = false;
    };
  }, [appId, n, prevN, key]);
  const pair = res?.key === key ? res.pair ?? null : null;
  const err = restoreErr || (res?.key === key ? res.err ?? "" : "");
  const open = openKey?.startsWith(`${n}:`) ? openKey.slice(String(n).length + 1) : null;
  const setOpen = (p: string | null) => setOpenKey(p === null ? null : `${n}:${p}`);
  const changes: FileChange[] = useMemo(() => (pair ? compareVersions(pair.prev, pair.next) : []), [pair]);
  const v = versions.find((x) => x.n === n);
  const totals = changes.reduce((a, c) => ({ add: a.add + c.added, rem: a.rem + c.removed }), { add: 0, rem: 0 });
  const restore = async () => {
    setRestoring(true);
    try {
      await api(`/api/sites/${appId}/versions`, { method: "POST", body: JSON.stringify({ n }) });
      onRestored();
    } catch (e) {
      setRestoreErr((e as Error).message);
    } finally {
      setRestoring(false);
    }
  };
  const branch = async () => {
    setBranching(true);
    setRestoreErr("");
    try {
      const r = await api<{ site: { id: string } }>(`/api/sites/${appId}/branch`, { method: "POST", body: JSON.stringify({ n }) });
      onBranched?.(r.site.id);
    } catch (e) {
      setRestoreErr((e as Error).message);
    } finally {
      setBranching(false);
    }
  };
  return (
    <div className={s.changes}>
      <ol className={s.versions} aria-label="Versions">
        {versions.map((x) => (
          <li key={x.n}>
            <button type="button" className={s.version} aria-current={x.n === n || undefined} onClick={() => { setN(x.n); setRestoreErr(""); }}>
              <span className={s.vN}>v{x.n}</span>
              <span className={s.vText}>{x.prompt ? x.prompt : x.summary}</span>
              <span className={s.vMeta}>{new Date(x.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{x.n === head ? " · current" : ""}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className={s.changeMain}>
        <p className={s.versionNote}>This project keeps the newest {KEPT[plan ?? "free"] ?? 12} versions. A published version is not dropped. Restoring copies the one you pick forward, so nothing already saved is overwritten.</p>
        {n !== head ? <p className={s.versionBanner} role="status">You are looking at v{n}. The current draft is v{head}. Restore makes a new version from v{n} and leaves v{head} in the history.</p> : null}
        {v ? (
          <div className={s.changeHead}>
            <div>
              {v.prompt ? <p className={s.asked}><span>You asked</span>{v.prompt}</p> : null}
              <p className={s.summary}>{v.summary}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {n !== head ? <button type="button" className={s.ghostBtn} onClick={restore} disabled={restoring || branching}>{restoring ? "Restoring…" : `Restore v${n}`}</button> : null}
              <button type="button" className={s.ghostBtn} onClick={branch} disabled={restoring || branching} title="Start a separate draft from this version. The original keeps its full history.">{branching ? "Branching…" : `Branch from v${n}`}</button>
            </div>
          </div>
        ) : null}
        {err ? <div className={s.paneMsg} role="alert">{err}</div> : !pair ? <div className={s.paneMsg}>Comparing with {prevN ? `v${prevN}` : "nothing (first version)"}…</div> : (
          <>
            <p className={s.changeTotals}>{prevN ? `Compared with v${prevN}: ` : "First version: "}<b>{changes.length}</b> file{changes.length === 1 ? "" : "s"} · <span className={s.plus}>+{totals.add}</span> <span className={s.minus}>−{totals.rem}</span></p>
            {!changes.length ? <p className={s.paneMsg}>No file changed in this version.</p> : null}
            <ul className={s.fileChanges}>
              {changes.map((c) => (
                <li key={c.path}>
                  <button type="button" className={s.fileChange} aria-expanded={open === c.path} onClick={() => setOpen(open === c.path ? null : c.path)}>
                    <span className={s.fcStatus} data-s={c.status}>{c.status === "added" ? "New" : c.status === "removed" ? "Removed" : "Changed"}</span>
                    <span className={s.fcPath}>{c.path}</span>
                    <span className={s.grow} />
                    <span className={s.plus}>+{c.added}</span>
                    <span className={s.minus}>−{c.removed}</span>
                    <span className={s.bars} aria-hidden="true">{bars(c)}</span>
                  </button>
                  {open === c.path && pair ? <FileDiff a={pair.prev[c.path] ?? ""} b={pair.next[c.path] ?? ""} /> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function bars(c: FileChange) {
  const total = Math.max(1, c.added + c.removed);
  const add = Math.round((c.added / total) * 5);
  return Array.from({ length: 5 }, (_, i) => <i key={i} data-k={i < add ? "+" : "-"} />);
}

function FileDiff({ a, b }: { a: string; b: string }) {
  const hunks = useMemo(() => toHunks(diffLines(a, b), 3), [a, b]);
  let shown = 0;
  return (
    <div className={s.diff}>
      {hunks.map((h, i) => {
        if (shown > 600) return i === hunks.length - 1 ? <div key={i} className={s.paneMsg}>Diff shortened; open the Code tab for the whole file.</div> : null;
        let o = h.oldStart;
        let n = h.newStart;
        return (
          <div key={i} className={s.hunk}>
            <div className={s.hunkHead}>@@ line {h.newStart} @@</div>
            {h.ops.map((op, j) => {
              shown++;
              const ln = op.t === "+" ? n++ : op.t === "-" ? o++ : (o++, n++);
              return <div key={j} className={s.dl} data-t={op.t}><span className={s.dn}>{ln}</span><span className={s.dm}>{op.t === "=" ? " " : op.t === "+" ? "+" : "−"}</span><span className={s.dt}>{op.text || " "}</span></div>;
            })}
          </div>
        );
      })}
    </div>
  );
}
