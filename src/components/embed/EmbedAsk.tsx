"use client";

/**
 * Framed Ask UI for /embed. Asks go to /api/embed/ask on the publisher's widget.
 * Posts height to the parent via postMessage so embed.js can resize.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useEnterToSend } from "@/lib/use-enter-to-send";
import s from "./EmbedAsk.module.css";
import { EMBED_ACCENT_HEX, type EmbedAccent, type EmbedTheme } from "@/lib/embed/config";

const SUGGESTIONS = ["Rent or buy a home right now? Give the strongest case for each.", "JSONB column or a normalized table for user settings?", "Is intermittent fasting worth trying, and where do experts disagree?"];

type Msg = { role: "user" | "assistant"; text: string; meta?: string };

type Props = {
  widgetId: string;
  theme: EmbedTheme;
  accent: EmbedAccent;
  models: "free" | "plan";
  parent: string | null;
  grant?: string | null;
  originDenied?: boolean;
};

export function EmbedAsk({ widgetId, theme, accent, models, parent, grant, originDenied }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const reportHeight = useCallback(() => {
    if (!root.current || !parent) return;
    const h = Math.ceil(root.current.getBoundingClientRect().height);
    try {
      window.parent.postMessage({ source: "keplar-embed", type: "resize", height: h, id: widgetId }, parent);
    } catch {
      /* cross-origin parent may reject; ignore */
    }
  }, [parent, widgetId]);

  useEffect(() => {
    reportHeight();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => reportHeight()) : null;
    if (ro && root.current) ro.observe(root.current);
    return () => ro?.disconnect();
  }, [reportHeight, msgs, err, busy]);

  const ask = async (preset?: string) => {
    const question = (preset ?? q).trim();
    if (!question || busy) return;
    setBusy(true);
    setErr("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    try {
      const history = msgs.slice(-4).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const r = await fetch("/api/embed/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ widgetId, question, history, ...(grant ? { grant } : {}) }),
      });
      const j = (await r.json().catch(() => ({}))) as { answer?: string; agreement?: string; models?: string[]; error?: { message?: string } };
      if (!r.ok) throw new Error(j.error?.message ?? "That didn't work.");
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: j.answer ?? "",
          meta: [j.agreement, j.models?.length ? `Models: ${j.models.join(", ")}` : ""].filter(Boolean).join(" · "),
        },
      ]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [inputRef, enter] = useEnterToSend({
    canSend: !busy && q.trim().length > 0,
    onSend: () => void ask(),
  });

  if (originDenied) {
    return (
      <div ref={root} className={s.root} data-theme={theme} style={{ ["--emb-accent" as string]: EMBED_ACCENT_HEX[accent] }}>
        <p className={s.err} role="alert">This site is not allowed to load this Keplar widget. Ask the site owner to add your domain to the allowlist.</p>
      </div>
    );
  }

  return (
    <div ref={root} className={s.root} data-theme={theme} style={{ ["--emb-accent" as string]: EMBED_ACCENT_HEX[accent] }}>
      <div className={s.brand}>
        <span className={s.mark}><span className={s.dot} aria-hidden="true" /><a href="https://keplar.one" target="_blank" rel="noopener noreferrer">Keplar Ask</a></span>
        <span className={s.lane}>{models === "free" ? "free models" : "premium models"}</span>
      </div>
      <div className={s.thread} aria-live="polite">
        {msgs.length === 0 ? (
          <div className={s.empty}>
            <p className={s.emptyTitle}>Ask several models at once.</p>
            <p className={s.hint}>Keplar compares their answers, writes one reply, and tells you where they disagreed.</p>
            <div className={s.chips}>
              {SUGGESTIONS.map((x) => <button key={x} type="button" className={s.chip} disabled={busy} onClick={() => void ask(x)}>{x}</button>)}
            </div>
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={s.bubble} data-role={m.role}>
            {m.text}
            {m.meta ? <div className={s.meta}>{m.meta}</div> : null}
          </div>
        ))}
      </div>
      {busy ? <p className={s.thinking} role="status"><i /><i /><i /> <span>Comparing models…</span></p> : null}
      {err ? <p className={s.err} role="alert">{err}</p> : null}
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="kp-embed-sr" htmlFor="keplar-embed-q" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Your question</label>
        <textarea
          id="keplar-embed-q"
          ref={inputRef}
          className={s.input}
          value={q}
          maxLength={2000}
          placeholder="Ask Keplar…"
          disabled={busy}
          enterKeyHint={enter.enterKeyHint}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={enter.onKeyDown}
          onBeforeInput={enter.onBeforeInput}
        />
        <div className={s.foot}>
          <button type="submit" className={s.btn} disabled={busy || !q.trim()}>{busy ? "Asking…" : "Ask"}</button>
          <a href="https://keplar.one/?utm_source=embed" target="_blank" rel="noopener noreferrer">Powered by Keplar</a>
        </div>
      </form>
    </div>
  );
}
