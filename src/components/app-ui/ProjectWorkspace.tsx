"use client";

/**
 * One saved project's workspace: instructions, its own memory (notes you can edit and delete), files, chats, privacy and data controls.
 * Everything here is stored on the server for the signed-in account (/api/projects). The Free privacy gate is shown, not hidden: on Free the
 * project's memory, files and instructions are never sent to the free models (src/lib/privacy/free-gate.ts).
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { activeScopeHeaders } from "./state/scope";
import { DocUploadError, forgetDocument, readDocument } from "./doc-client";
import { DOC_ACCEPT } from "@/lib/documents/chat-docs";
import { PROJECT_LIMITS } from "@/lib/projects/types";
import s from "./Panels.module.css";

type Note = { id: string; text: string; updatedAt: string };
type FileRow = { id: string; name: string; chars: number; truncated: boolean };
type Detail = {
  project: { id: string; name: string; instructions: string; memoryOn: boolean };
  notes: Note[];
  files: FileRow[];
  chats: { id: string; title: string; updatedAt: number }[];
  gate: { withheldOnThisPlan: boolean; note: string };
};

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...activeScopeHeaders() }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

type Confirm = null | "notes" | "files" | "chats" | "project";

export function ProjectWorkspace({ projectId, name, signedIn, onBack, onNewChat, onOpenChat, onOpenAllChats, onRemoved, onChatsCleared }: {
  projectId: string;
  name: string;
  signedIn: boolean;
  onBack: () => void;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onOpenAllChats: () => void;
  onRemoved: (chats: "keep" | "delete") => void;
  onChatsCleared: () => void;
}) {
  const uid = useId();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState("");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [alsoChats, setAlsoChats] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void (async () => {
      try {
        // A project that so far only lived in this browser is adopted under the id its chats already use (idempotent).
        await api("/api/projects", "POST", { id: projectId, name }).catch((e: Error) => { if (!/exists/.test(e.message)) throw e; });
        const r = await api<Detail>(`/api/projects/${projectId}`);
        if (!live) return;
        setD(r);
        setInstr(r.project.instructions);
      } catch (e) {
        if (live) setErr((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [signedIn, projectId, name, tick]);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); if (done) setMsg(done); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!signedIn) {
    return (
      <div className={s.wrap}>
        <div className={s.top}><button type="button" className={s.btn} onClick={onBack}>← All projects</button><h2>{name}</h2></div>
        <p className={s.notice}>Project memory, files and instructions are saved to your account, so they need you to be signed in. Chats in this project still work on this device. <Link href="/signin">Sign in</Link></p>
      </div>
    );
  }
  if (!d) return <div className={s.wrap}><div className={s.top}><button type="button" className={s.btn} onClick={onBack}>← All projects</button><h2>{name}</h2></div>{err ? <p className={s.err} role="alert">{err}</p> : <p className={s.muted}>Loading…</p>}</div>;

  const p = d.project;
  const patch = (b: Record<string, unknown>) => api<{ project: Detail["project"] }>(`/api/projects/${projectId}`, "PATCH", b).then((r) => setD((x) => (x ? { ...x, project: { ...x.project, ...r.project } } : x)));

  return (
    <div className={s.wrap}>
      <div className={s.top}>
        <button type="button" className={s.btn} onClick={onBack}>← All projects</button>
        <h2>{p.name}</h2>
        <span className={s.grow} />
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={onNewChat}>New chat in this project</button>
      </div>
      <div aria-live="polite">
        {err ? <p className={s.err} role="alert">{err}</p> : null}
        {msg ? <p className={s.ok}>{msg}</p> : null}
      </div>

      {d.gate.withheldOnThisPlan ? <p className={s.notice}><strong>Free plan:</strong> this project&apos;s memory, files and instructions are saved, but they are not sent to the free models. {d.gate.note} Paid plans send them.</p> : null}

      <div className={s.cards}>
        <section className={s.card} aria-labelledby={`${uid}-ctx`}>
          <h3 className={s.h3} id={`${uid}-ctx`}>Instructions</h3>
          <p className={s.help}>Context every chat in this project starts with, for example who it is for or how answers should read. Up to {PROJECT_LIMITS.instructions} characters.</p>
          <label className="visually-hidden" htmlFor={`${uid}-instr`}>Project instructions</label>
          <textarea id={`${uid}-instr`} className={s.field} value={instr} maxLength={PROJECT_LIMITS.instructions} onChange={(e) => setInstr(e.target.value)} />
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy || instr === p.instructions} onClick={() => run(async () => { await patch({ instructions: instr }); }, "Instructions saved.")}>Save instructions</button>
            <label className={s.switch}>
              <input type="checkbox" checked={p.memoryOn} disabled={busy} onChange={(e) => run(async () => { await patch({ memoryOn: e.target.checked }); }, e.target.checked ? "Project memory is on." : "Project memory is off: nothing from this project is sent to a model.")} />
              Use this project&apos;s memory in its chats
            </label>
          </div>
        </section>

        <section className={s.card} aria-labelledby={`${uid}-mem`}>
          <h3 className={s.h3} id={`${uid}-mem`}>Project memory <span className={s.muted}>{d.notes.length} of {PROJECT_LIMITS.notes}</span></h3>
          <p className={s.help}>Short facts about this project that stay between chats. Only you add them; you can edit or delete any of them. Keplar suggesting notes from project chats is <span className={s.badge}>Coming soon</span></p>
          <form className={s.row} onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; void run(async () => { const r = await api<{ note: Note }>(`/api/projects/${projectId}/memory`, "POST", { text: note }); setD((x) => (x ? { ...x, notes: [r.note, ...x.notes] } : x)); setNote(""); }, "Saved to project memory."); }}>
            <label className="visually-hidden" htmlFor={`${uid}-note`}>New project note</label>
            <input id={`${uid}-note`} className={s.field} style={{ flex: "1 1 14rem", width: "auto" }} placeholder="e.g. The launch is in March" maxLength={PROJECT_LIMITS.noteChars} value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className={s.btn} disabled={busy || !note.trim()}>Add note</button>
          </form>
          {d.notes.length === 0 ? <p className={s.muted}>No notes yet.</p> : (
            <ul className={s.list}>
              {d.notes.map((n) => (
                <li key={n.id} className={s.item}>
                  {edit?.id === n.id ? (
                    <>
                      <label className="visually-hidden" htmlFor={`${uid}-e${n.id}`}>Edit note</label>
                      <input id={`${uid}-e${n.id}`} className={s.field} style={{ flex: "1 1 14rem", width: "auto" }} maxLength={PROJECT_LIMITS.noteChars} value={edit.text} onChange={(e) => setEdit({ id: n.id, text: e.target.value })} />
                      <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={() => run(async () => { const r = await api<{ note: Note }>(`/api/projects/${projectId}/memory/${n.id}`, "PATCH", { text: edit.text }); setD((x) => (x ? { ...x, notes: x.notes.map((y) => (y.id === n.id ? r.note : y)) } : x)); setEdit(null); }, "Note saved.")}>Save</button>
                      <button type="button" className={s.btn} onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className={s.itemText}>{n.text}</span>
                      <button type="button" className={`${s.btn} ${s.btnQuiet}`} onClick={() => setEdit({ id: n.id, text: n.text })} aria-label={`Edit note: ${n.text.slice(0, 40)}`}>Edit</button>
                      <button type="button" className={`${s.btn} ${s.btnQuiet} ${s.btnDanger}`} disabled={busy} aria-label={`Delete note: ${n.text.slice(0, 40)}`} onClick={() => run(async () => { await api(`/api/projects/${projectId}/memory/${n.id}`, "DELETE", undefined); setD((x) => (x ? { ...x, notes: x.notes.filter((y) => y.id !== n.id) } : x)); }, "Note deleted.")}>Delete</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {d.notes.length > 0 ? (confirm === "notes" ? (
            <div className={s.confirm} role="alertdialog" aria-label="Clear project memory">
              <p>Delete all {d.notes.length} notes? This is permanent.</p>
              <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => run(async () => { await api(`/api/projects/${projectId}/memory`, "DELETE", { confirm: "DELETE" }); setD((x) => (x ? { ...x, notes: [] } : x)); setConfirm(null); }, "Project memory cleared.")}>Clear memory</button>
              <button type="button" className={s.btn} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          ) : <button type="button" className={`${s.btn} ${s.btnDanger}`} style={{ alignSelf: "flex-start" }} onClick={() => setConfirm("notes")}>Clear project memory</button>) : null}
        </section>

        <section className={s.card} aria-labelledby={`${uid}-files`}>
          <h3 className={s.h3} id={`${uid}-files`}>Files <span className={s.muted}>{d.files.length} of {PROJECT_LIMITS.files}</span></h3>
          <p className={s.help}>PDF, text, code and CSV. Keplar reads the text once and keeps that text (not the original file) with the project. Relevant passages go along with this project&apos;s chats on paid plans.</p>
          <input ref={fileInput} type="file" accept={DOC_ACCEPT} className="visually-hidden" aria-label="Add a file to this project" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void run(async () => {
              try {
                const doc = await readDocument(f);
                const r = await api<{ file: FileRow }>(`/api/projects/${projectId}/files`, "POST", { name: f.name, text: doc.text, truncated: doc.truncated });
                setD((x) => (x ? { ...x, files: [r.file, ...x.files] } : x));
              } catch (er) {
                throw er instanceof DocUploadError ? new Error(er.message) : er;
              } finally {
                forgetDocument({ name: f.name, size: f.size });
              }
            }, `Added ${f.name}.`);
          }} />
          <div className={s.row}><button type="button" className={s.btn} disabled={busy || d.files.length >= PROJECT_LIMITS.files} onClick={() => fileInput.current?.click()}>Add a file</button></div>
          {d.files.length === 0 ? <p className={s.muted}>No files yet.</p> : (
            <ul className={s.list}>
              {d.files.map((f) => (
                <li key={f.id} className={s.item}>
                  <span className={s.itemText}>{f.name}<span className={s.itemMeta}>{f.chars.toLocaleString()} characters{f.truncated ? " · only the first part is kept" : ""}</span></span>
                  <button type="button" className={`${s.btn} ${s.btnQuiet} ${s.btnDanger}`} disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => run(async () => { await api(`/api/projects/${projectId}/files/${f.id}`, "DELETE", undefined); setD((x) => (x ? { ...x, files: x.files.filter((y) => y.id !== f.id) } : x)); }, "File removed.")}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {d.files.length > 1 ? (confirm === "files" ? (
            <div className={s.confirm} role="alertdialog" aria-label="Remove all files">
              <p>Remove all {d.files.length} files from this project?</p>
              <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => run(async () => { await api(`/api/projects/${projectId}/files`, "DELETE", { confirm: "DELETE" }); setD((x) => (x ? { ...x, files: [] } : x)); setConfirm(null); }, "Files removed.")}>Remove all</button>
              <button type="button" className={s.btn} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          ) : <button type="button" className={`${s.btn} ${s.btnDanger}`} style={{ alignSelf: "flex-start" }} onClick={() => setConfirm("files")}>Remove all files</button>) : null}
        </section>

        <section className={s.card} aria-labelledby={`${uid}-chats`}>
          <h3 className={s.h3} id={`${uid}-chats`}>Chats <span className={s.muted}>{d.chats.length}</span></h3>
          {d.chats.length === 0 ? <p className={s.muted}>No saved chats in this project yet.</p> : (
            <ul className={s.list}>
              {d.chats.slice(0, 8).map((c) => (
                <li key={c.id} className={s.item}>
                  <button type="button" className={`${s.btn} ${s.btnQuiet}`} style={{ justifyContent: "flex-start", flex: "1 1 14rem", minWidth: 0 }} onClick={() => onOpenChat(c.id)}><span className={s.itemText}>{c.title}</span></button>
                  <span className={s.muted}>{new Date(c.updatedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={s.row}>
            {d.chats.length > 8 ? <button type="button" className={s.btn} onClick={onOpenAllChats}>See all {d.chats.length}</button> : null}
            {d.chats.length > 0 ? (confirm === "chats" ? (
              <div className={s.confirm} role="alertdialog" aria-label="Delete this project's chats">
                <p>Delete all {d.chats.length} chats in this project, with their saved summaries? This is permanent.</p>
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => run(async () => { await api(`/api/projects/${projectId}/chats`, "DELETE", { confirm: "DELETE" }); setD((x) => (x ? { ...x, chats: [] } : x)); setConfirm(null); onChatsCleared(); setTick((t) => t + 1); }, "Chats deleted.")}>Delete chats</button>
                <button type="button" className={s.btn} onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            ) : <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={() => setConfirm("chats")}>Delete this project&apos;s chats</button>) : null}
          </div>
        </section>

        <section className={s.card} aria-labelledby={`${uid}-data`}>
          <h3 className={s.h3} id={`${uid}-data`}>Your data</h3>
          <p className={s.help}>Export everything in this project (instructions, notes, file text and chats) as one JSON file, or delete the project.</p>
          <div className={s.row}>
            <a className={s.btn} href={`/api/projects/${projectId}/export`} download>Export project (JSON)</a>
          </div>
          {confirm === "project" ? (
            <div className={s.confirm} role="alertdialog" aria-label="Delete project">
              <p>Delete &ldquo;{p.name}&rdquo;, its notes and its files? This is permanent.</p>
              <label className={s.switch}><input type="checkbox" checked={alsoChats} onChange={(e) => setAlsoChats(e.target.checked)} /> Also delete its {d.chats.length} chats (otherwise they stay in History)</label>
              <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy} onClick={() => run(async () => { await api(`/api/projects/${projectId}`, "DELETE", { confirm: "DELETE", chats: alsoChats ? "delete" : "keep" }); onRemoved(alsoChats ? "delete" : "keep"); onBack(); })}>Delete project</button>
              <button type="button" className={s.btn} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          ) : <button type="button" className={`${s.btn} ${s.btnDanger}`} style={{ alignSelf: "flex-start" }} onClick={() => setConfirm("project")}>Delete project</button>}
        </section>
      </div>
    </div>
  );
}
