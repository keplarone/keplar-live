"use client";
/** Code: the files of the current version, read-only, tinted. Loaded only when the Code tab is opened. */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { langOf, sortFiles, tokenize } from "./highlight";
import { FileFinder, useGoToFile } from "./FileFinder";
import s from "./studio.module.css";
import { ActivityIndicator, Button } from "@/components/kit";

export default function CodePane({ appId, version, onSaved }: { appId: string; version: number; onSaved?: (n: number) => void }) {
  const key = `${appId}:${version}`;
  const [res, setRes] = useState<{ key: string; files?: Record<string, string>; err?: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  useEffect(() => {
    let on = true;
    api<{ files: Record<string, string> }>(`/api/sites/${appId}/versions?n=${version}`).then((r) => on && setRes({ key, files: r.files }), (e) => on && setRes({ key, err: (e as Error).message }));
    return () => {
      on = false;
    };
  }, [appId, version, key]);
  const files = res?.key === key ? res.files ?? null : null;
  const err = res?.key === key ? res.err ?? "" : "";
  const paths = useMemo(() => sortFiles(Object.keys(files ?? {})), [files]);
  const pick = sel && files?.[sel] !== undefined ? sel : paths[0] ?? null;
  const text = pick && files ? files[pick] : "";
  const toks = useMemo(() => (pick && !editing ? tokenize(text.slice(0, 200_000), langOf(pick)) : []), [pick, text, editing]);
  const lines = useMemo(() => text.split("\n").length, [text]);
  const [finding, setFinding] = useGoToFile();
  if (err) return <div className={s.paneMsg} role="alert">{err}</div>;
  if (!files) return <div className={s.paneMsg}><ActivityIndicator label="Opening the code" showLabel /></div>;
  return (
    <div className={s.code}>
      {finding ? <FileFinder paths={paths} onPick={(p) => { setSel(p); setEditing(false); setSaveErr(""); }} onClose={() => setFinding(false)} /> : null}
      <nav className={s.files} aria-label="Files">
        {paths.map((p) => (
          <button key={p} type="button" className={s.file} aria-current={p === pick || undefined} onClick={() => { setSel(p); setEditing(false); setSaveErr(""); }}>
            <span className={s.fileDir}>{p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : ""}</span>{p.slice(p.lastIndexOf("/") + 1)}
          </button>
        ))}
      </nav>
      <div className={s.codeMain}>
        <div className={s.codeBar}>
          <span className={s.codePath}>{pick}</span>
          <span className={s.codeMeta}>{lines} lines · {(text.length / 1024).toFixed(1)} KB</span>
          <span className={s.grow} />
          <Button variant="ghost" size="sm" onClick={() => setFinding(true)} title="Go to file (Ctrl+P)" trailingIcon={<kbd className={s.kbdHint}>Ctrl P</kbd>}>Go to file</Button>
          <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(editing ? draft : text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }}>{copied ? "Copied" : "Copy"}</Button>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setSaveErr(""); }}>Cancel</Button>
              <Button variant="primary" size="sm" loading={saving} disabled={draft === text} onClick={() => {
                if (!pick) return;
                setSaving(true);
                setSaveErr("");
                api<{ version: number }>(`/api/sites/${appId}/versions`, { method: "PATCH", body: JSON.stringify({ path: pick, content: draft }) })
                  .then((r) => { setEditing(false); onSaved?.(r.version); })
                  .catch((e) => setSaveErr((e as Error).message))
                  .finally(() => setSaving(false));
              }}>{saving ? "Saving…" : "Save as new version"}</Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => { setDraft(text); setEditing(true); setSaveErr(""); }}>Edit</Button>
          )}
        </div>
        {saveErr ? <p className={s.inlineErr} role="alert">{saveErr}</p> : null}
        {editing ? (
          <textarea className={s.codeEdit} value={draft} spellCheck={false} aria-label={`Edit ${pick}`} onChange={(e) => setDraft(e.target.value)} />
        ) : (
        <pre className={s.pre} tabIndex={0}>
          <code>{toks.map((t, i) => (t.k ? <span key={i} className={s[`tk_${t.k}`]}>{t.v}</span> : t.v))}</code>
        </pre>
        )}
      </div>
    </div>
  );
}
