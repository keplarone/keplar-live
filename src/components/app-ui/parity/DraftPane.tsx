"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addVersion, applyText, draftFromAnswer, loadDrafts, revisePrompt, saveDrafts, type Draft } from "@/lib/personalize/drafts";
import { Markdown } from "../Markdown";
import { onDraft } from "./draft-bus";
import { CodeRunner, runnableLang } from "./CodeRunner";
import { Button, Icon, IconButton, Tabs, confirmAction, tabId, tabPanelId } from "@/components/kit";
import s from "./parity.module.css";

type Tab = "edit" | "preview" | "versions" | "all";
const TABS_ID = "draft-views";

/**
 * The side draft: an editable document or code file beside the chat, opened from any answer. Edit directly, preview, keep versions,
 * ask Keplar to revise all of it or just the selected part (sent as a normal chat message), apply the revised answer back, copy or
 * download it, and run code drafts in the sandbox. Drafts stay in this browser.
 */
export function DraftPane({ scope, plan, onAsk }: { scope: string; plan: string; onAsk: (text: string) => void }) {
  // Mounted with key={scope}: a different account starts from its own drafts.
  const [drafts, setDrafts] = useState<Draft[]>(() => loadDrafts(scope));
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("edit");
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const headRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef(drafts);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

  const commit = useCallback((next: Draft[]) => { setDrafts(next); saveDrafts(scope, next); }, [scope]);
  const upsert = useCallback((d: Draft) => commit([d, ...draftsRef.current.filter((x) => x.id !== d.id)]), [commit]);

  useEffect(() => onDraft((e) => {
    if (e.kind === "open") {
      const d = draftFromAnswer(e.markdown, e.title);
      upsert(d);
      setOpenId(d.id);
      setTab("edit");
      setStatus("Opened as a new draft. It stays in this browser.");
    } else {
      const d = draftsRef.current.find((x) => x.id === e.draftId);
      if (!d) { setStatus("That draft isn't in this browser any more. Opened the answer as a new draft."); const n = draftFromAnswer(e.markdown, "Revised draft"); upsert(n); setOpenId(n.id); return; }
      upsert(addVersion(d, applyText(e.markdown, d.kind), "Revised by Keplar"));
      setOpenId(d.id);
      setTab("edit");
      setStatus("Applied Keplar's revision. The previous text is in Versions.");
    }
  }), [upsert]);

  const d = drafts.find((x) => x.id === openId) ?? null;
  useEffect(() => { if (d) headRef.current?.focus(); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openId) return;
    // Escape closes the pane, except in its fields and while a dialog (e.g. the delete confirm) owns Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement)?.closest?.("textarea, input, dialog")) return;
      e.preventDefault(); // closes only the draft: the app's Esc (stop a running answer) must not also fire
      e.stopPropagation();
      setOpenId(null);
    };
    // On document, bubbling (as research/Research.tsx): after overlays opened over the pane (the Lightbox listens in the window's
    // capture phase and stops the event), before the app's window shortcuts.
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  if (!d) return null;
  const edit = (patch: Partial<Draft>) => upsert({ ...d, ...patch, updatedAt: Date.now() });
  const revise = () => {
    const el = areaRef.current;
    const selection = tab === "edit" && el && el.selectionEnd > el.selectionStart ? { start: el.selectionStart, end: el.selectionEnd } : undefined;
    const msg = revisePrompt(d, instruction, { plan, selection });
    if (typeof msg !== "string") { setStatus(msg.error); return; }
    upsert(addVersion(d, d.text, "Before revision"));
    onAsk(msg);
    setInstruction("");
    setStatus(`Sent to Keplar${selection ? " (selected part only)" : ""}. When the answer arrives, press "Apply to draft" under it.`);
  };
  const download = () => {
    const ext = d.kind === "code" ? (d.lang === "python" || d.lang === "py" ? "py" : d.lang === "ts" || d.lang === "typescript" ? "ts" : d.lang === "js" || d.lang === "javascript" ? "js" : "txt") : "md";
    const url = URL.createObjectURL(new Blob([d.text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "draft"}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const removeDraft = async (x: Draft) => {
    const ok = await confirmAction({ title: `Delete the draft “${x.title}”?`, body: "This can't be undone.", confirmLabel: "Delete draft", danger: true });
    if (!ok) return;
    commit(draftsRef.current.filter((y) => y.id !== x.id));
    if (x.id === d.id) setOpenId(null);
  };
  const runLang = d.kind === "code" ? runnableLang(d.lang ?? "") : null;
  return (
    <aside className={s.pane} aria-label="Draft" data-draft-pane="">
      <div className={s.paneHead}>
        <input ref={headRef} className={s.paneTitle} value={d.title} aria-label="Draft title" maxLength={120} onChange={(e) => edit({ title: e.target.value })} />
        <IconButton label="Close draft" tooltipSide="left" onClick={() => setOpenId(null)} icon={<Icon name="close" size={16} />} />
      </div>
      <Tabs
        id={TABS_ID}
        label="Draft views"
        className={s.tabs}
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
          { value: "versions", label: "Versions", count: d.versions.length },
          { value: "all", label: "All drafts", count: drafts.length },
        ]}
      />
      <div className={s.paneBody} role="tabpanel" id={tabPanelId(TABS_ID, tab)} aria-labelledby={tabId(TABS_ID, tab)}>
        {tab === "edit" ? (
          <textarea ref={areaRef} className={s.area} data-kind={d.kind} value={d.text} spellCheck={d.kind === "doc"} aria-label="Draft text" onChange={(e) => edit({ text: e.target.value })} onBlur={() => upsert(addVersion(d, d.text, "Edited"))} />
        ) : tab === "preview" ? (
          d.kind === "code" ? <Markdown source={"```" + (d.lang ?? "") + "\n" + d.text + "\n```"} /> : <Markdown source={d.text} />
        ) : tab === "versions" ? (
          <ul className={s.versions}>
            {[...d.versions].reverse().map((v, i) => (
              <li key={`${v.at}-${i}`}>
                <span>{v.label} · {new Date(v.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {v.text.length.toLocaleString()} chars</span>
                <Button size="sm" variant="secondary" onClick={() => { upsert(addVersion(d, v.text, "Restored")); setTab("edit"); setStatus("Restored that version."); }}>Restore</Button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={s.versions}>
            {drafts.map((x) => (
              <li key={x.id}>
                <span>{x.title} · {x.kind === "code" ? x.lang || "code" : "document"}</span>
                <span className={s.row}>
                  <Button size="sm" variant="secondary" onClick={() => { setOpenId(x.id); setTab("edit"); }}>Open</Button>
                  <Button size="sm" variant="ghost" onClick={() => void removeDraft(x)}>Delete</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {runLang && tab === "edit" ? <CodeRunner code={d.text} lang={runLang} /> : null}
      </div>
      <div className={s.paneFoot}>
        <div className={s.row}>
          <input className={s.input} value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); revise(); } }} placeholder="Tell Keplar what to change (select text to change only that part)" aria-label="Revision instruction" maxLength={600} />
          <Button size="sm" variant="primary" onClick={revise}>Revise with Keplar</Button>
        </div>
        <div className={s.row}>
          <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(d.text).then(() => setStatus("Copied.")).catch(() => setStatus("Couldn't copy.")); }}>Copy</Button>
          <Button size="sm" variant="secondary" onClick={download}>Download</Button>
          <Button size="sm" variant="secondary" onClick={() => { upsert(addVersion(d, d.text, "Saved")); setStatus("Saved a version."); }}>Save version</Button>
        </div>
        <p className={s.status} role="status">{status}</p>
      </div>
    </aside>
  );
}
