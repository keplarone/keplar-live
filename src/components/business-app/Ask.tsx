"use client";

import { useEffect, useRef, useState } from "react";
import { useEnterToSend } from "@/lib/use-enter-to-send";
import { Markdown } from "@/components/app-ui/Markdown";
import type { KeplarEvent } from "@/lib/orchestration/types";
import type { MediaInput } from "@/lib/orchestration/media";
import { AttachButton, mediaHandlers, MediaTray, ShareBar, ShareButton, useMediaAttach, useShare } from "./attach";
import { runEngine } from "./engine";
import { loadChat, saveChat, type SavedTurn } from "./chats";
import type { KeplarAnswer } from "@/lib/orchestration/types";
import s from "./cursor.module.css";

type Turn = { id: string; q: string; a: string; done: boolean; note?: string; models?: string; thumbs?: string[]; at: number; answer?: KeplarAnswer | null };

/**
 * A Business chat: questions answered by Keplar's multi-model engine, with project context when one was chosen. Saved to the
 * account after every answer (chats.ts), so it is in the sidebar's Chats and reopens with ?v=chat&c=<id>.
 */
export function Ask({ chatId, first, firstMedia, projectId: projectIn, resume, onSaved }: { chatId: string; first?: string; firstMedia?: MediaInput; projectId: string | null; resume?: boolean; onSaved?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [projectId, setProjectId] = useState(projectIn);
  const [loading, setLoading] = useState(Boolean(resume));
  const createdAt = useRef(0);
  const saved = useRef<SavedTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const media = useMediaAttach();
  const share = useShare(media);

  const ask = async (q: string, m?: MediaInput) => {
    if (!q.trim() || busy) return;
    // One preview per image, and the first frame of a video.
    const thumbs = m?.images.filter((i) => !i.frame || i.frame.index === 0).map((i) => i.dataUrl);
    const id = Math.random().toString(36).slice(2);
    const history = turns.flatMap((t) => [{ role: "user" as const, text: t.q }, { role: "keplar" as const, text: t.a }]);
    const at = Date.now();
    setTurns((t) => [...t, { id, q, a: "", done: false, at, ...(thumbs?.length ? { thumbs } : {}) }]);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const patch = (p: Partial<Turn>) => setTurns((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      let acc = "";
      const ans = await runEngine({ prompt: q, mode: "ask", projectId, history, chatId, media: m }, (e: KeplarEvent) => {
        if (e.type === "delta") { acc += e.text; patch({ a: acc }); }
        if (e.type === "error") patch({ note: e.message });
        if (e.type === "limit") patch({ note: e.window?.message ?? "You've reached your usage limit for now." });
      }, ctl.signal);
      const a = ans?.markdown ?? acc;
      patch({ a, done: true, answer: ans, models: ans ? `${ans.consensus.responded} of ${ans.consensus.consulted} models · ${ans.consensus.summary}` : undefined });
      if (a) {
        saved.current = [...saved.current, { id, q, a, at, answer: ans }];
        if (!createdAt.current) createdAt.current = at;
        void saveChat(chatId, projectId, createdAt.current, saved.current).then(() => onSaved?.());
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch({ note: e instanceof Error ? e.message : "Something went wrong.", done: true });
      else patch({ done: true });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (resume) {
      void loadChat(chatId).then((c) => {
        if (c) {
          createdAt.current = c.createdAt;
          saved.current = c.turns;
          setProjectId(c.projectId);
          setTurns(c.turns.map((t) => ({ ...t, done: true })));
        } else setTurns([{ id: "missing", q: "", a: "", done: true, at: Date.now(), note: "This chat couldn't be opened. It may have been deleted." }]);
        setLoading(false);
      });
    } else if (first) queueMicrotask(() => void ask(first, firstMedia));
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first question runs once, on arrival
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]);
  const sendFollow = () => {
    if (media.busy || busy || !text.trim()) return;
    const q = text;
    setText("");
    void ask(q, media.take());
  };
  const [inputRef, enter] = useEnterToSend({
    canSend: !media.busy && !busy && text.trim().length > 0,
    onSend: sendFollow,
  });

  return (
    <div className={s.thread}>
      <div className={s.turns} aria-live="polite">
        {loading ? <span className={s.thinking}>Opening chat…</span> : null}
        {turns.map((t) => (
          <div key={t.id} className={s.turn}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data: previews of what was sent */}
            {t.thumbs?.length ? <div className={s.qMedia}>{t.thumbs.map((src, i) => <img key={i} src={src} alt={`Attachment ${i + 1}`} />)}</div> : null}
            {t.q ? <p className={s.q}>{t.q}</p> : null}
            <div className={s.a}>
              {t.a ? <Markdown source={t.a} streaming={!t.done} caret={!t.done} /> : !t.done ? <span className={s.thinking}>Thinking…</span> : null}
              {t.note ? <p className={s.note} role="alert">{t.note}</p> : null}
              {t.done && t.models ? <p className={s.meta}>{t.models}</p> : null}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className={`${s.composer} ${s.threadComposer}`} onSubmit={(e) => { e.preventDefault(); sendFollow(); }} {...mediaHandlers(media)}>
        <ShareBar share={share} />
        <MediaTray media={media} />
        <label htmlFor="biz-follow" className={s.srOnly}>Follow-up</label>
        <textarea id="biz-follow" ref={inputRef} rows={1} value={text} enterKeyHint={enter.enterKeyHint} onChange={(e) => setText(e.target.value)} onKeyDown={enter.onKeyDown} onBeforeInput={enter.onBeforeInput} placeholder={busy ? "Keplar is answering…" : "Follow up"} />
        <div className={s.composeBar}>
          <AttachButton media={media} disabled={busy} />
          <ShareButton share={share} />
          <span className={s.model}><span className={s.modelDot} aria-hidden="true" />Keplar One · Auto</span>
          <span className={s.grow} />
          {busy ? <button type="button" className={s.quickBtn} onClick={() => abort.current?.abort()}>Stop</button> : null}
          <button type="submit" className={s.sendBtn} data-orbit-fx="primary" data-orbit-icon="send" disabled={busy || !text.trim() || media.busy} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
