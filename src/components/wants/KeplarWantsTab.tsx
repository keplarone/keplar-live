"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PREFIX, P, enforcePrefix, clampCaret, appendTranscript } from "@/lib/wants/prefix";
import s from "./KeplarWantsTab.module.css";

type Card =
  | { kind: "user"; id: string; text: string }
  | { kind: "agent"; id: string; text: string }
  | { kind: "question"; id: string; question: string; options: string[]; answered?: string }
  | { kind: "pin"; id: string; summary: string; status: "pending" | "confirmed" | "cancelled"; setup?: boolean }
  | { kind: "fallback"; id: string; title: string; message: string };

type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type SpeechError = { error?: string };

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechError) => void) | null;
  onend: (() => void) | null;
}

type WantResponse = {
  status?: string;
  reason?: string;
  message?: string;
  confirmationId?: string;
  ui?: { type?: string; question?: string; options?: string[]; summary?: string; title?: string; message?: string };
  error?: string;
};

const getSpeech = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function KeplarWantsTab() {
  const [value, setValue] = useState(PREFIX);
  const [cards, setCards] = useState<Card[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pins, setPins] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const fixCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? P;
    const end = el.selectionEnd ?? P;
    if (start < P || end < P) el.setSelectionRange(clampCaret(start), clampCaret(end));
  }, []);

  const setAndPlace = (next: string, caret?: number) => {
    setValue(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const c = clampCaret(caret ?? next.length);
      el.setSelectionRange(c, c);
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next.startsWith(PREFIX)) {
      setValue(next);
      return;
    }
    const fixed = enforcePrefix(next, value);
    setAndPlace(fixed, (e.target.selectionStart ?? fixed.length) + (fixed.length - next.length));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? P;
    const end = el.selectionEnd ?? P;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === "Home" || (mod && e.key === "ArrowUp")) {
      e.preventDefault();
      el.setSelectionRange(P, e.shiftKey ? end : P);
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      el.setSelectionRange(P, value.length);
      return;
    }
    if (e.key === "Backspace") {
      if (start === end && start <= P) {
        e.preventDefault();
        return;
      }
      if (start < P) {
        e.preventDefault();
        setAndPlace(PREFIX + value.slice(end), P);
        return;
      }
      if (mod || e.altKey) {
        e.preventDefault();
        const body = value.slice(P, start);
        const cut = body.replace(/\S*\s*$/, "");
        setAndPlace(PREFIX + cut + value.slice(end), P + cut.length);
        return;
      }
    }
    if (e.key === "Delete" && start < P) {
      e.preventDefault();
      setAndPlace(PREFIX + value.slice(Math.max(end, start === end ? P : end)), P);
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowUp") && !mod) {
      if (e.shiftKey ? (el.selectionDirection === "backward" ? start : end) <= P && start <= P : start <= P && start === end) {
        e.preventDefault();
        if (!e.shiftKey) el.setSelectionRange(P, P);
        return;
      }
    }
    if (mod && e.key === "ArrowLeft") {
      e.preventDefault();
      el.setSelectionRange(P, e.shiftKey ? end : P);
      return;
    }
    if (e.key.length === 1 && !mod && start < P) {
      e.preventDefault();
      setAndPlace(PREFIX + e.key + value.slice(Math.max(end, P)), P + 1);
    }
  };

  const onCut = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? P;
    const end = el.selectionEnd ?? P;
    if (start < P) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", value.slice(Math.max(start, P), end));
      setAndPlace(PREFIX + value.slice(Math.max(end, P)), P);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? P;
    const end = el.selectionEnd ?? P;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
    const a = clampCaret(start);
    const b = clampCaret(end);
    setAndPlace(value.slice(0, a) + text + value.slice(b), a + text.length);
  };

  const onDrop = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain").replace(/[\r\n]+/g, " ");
    if (text) setAndPlace(value + (value.endsWith(" ") ? "" : " ") + text);
  };

  useEffect(() => {
    const el = inputRef.current;
    if (el) el.setSelectionRange(P, P);
  }, []);

  const push = (...next: Card[]) => setCards((cs) => [...cs, ...next]);

  const toggleVoice = () => {
    const Ctor = getSpeech();
    if (!Ctor) {
      push({ kind: "agent", id: uid(), text: "Voice dictation isn't supported in this browser. Type your want instead." });
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    let heard = false;
    rec.onresult = (ev) => {
      heard = true;
      let t = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
      t = t.replace(/^\s*i\s+want\s*/i, "");
      setValue((v) => appendTranscript(v.startsWith(PREFIX) ? v : PREFIX + v, t));
    };
    rec.onerror = (ev) => {
      setListening(false);
      if (!heard && ev.error !== "aborted" && ev.error !== "no-speech") {
        push({ kind: "agent", id: uid(), text: "Voice dictation isn't available right now. Type your want instead." });
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      push({ kind: "agent", id: uid(), text: "Voice dictation isn't available right now. Type your want instead." });
    }
  };

  const renderResult = (res: WantResponse) => {
    const ui = res.ui ?? {};
    if (res.message) push({ kind: "agent", id: uid(), text: res.message });
    else if (res.error) push({ kind: "agent", id: uid(), text: res.error });
    if (ui.type === "question" && ui.question) push({ kind: "question", id: uid(), question: ui.question, options: ui.options ?? [] });
    if (ui.type === "pin" && res.confirmationId) {
      const id = res.confirmationId;
      const setup = res.reason === "pin_not_set";
      setCards((cs) => (cs.some((c) => c.kind === "pin" && c.id === id) ? cs.map((c) => (c.kind === "pin" && c.id === id ? { ...c, setup: setup || c.setup, status: "pending" } : c)) : [...cs, { kind: "pin", id, summary: ui.summary ?? "", status: "pending", setup }]));
      if (!setup) void revealPinSetup(id);
    }
    if (ui.type === "fallback_modal") push({ kind: "fallback", id: uid(), title: ui.title ?? "Keplar stopped", message: ui.message ?? "Nothing was submitted." });
  };

  const callOrchestrate = async (body: Record<string, unknown>): Promise<WantResponse | null> => {
    setBusy(true);
    try {
      const r = await fetch("/api/keplar/wants/orchestrate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => null)) as WantResponse | null;
      if (r.status === 401) {
        push({ kind: "agent", id: uid(), text: "Sign in to use Keplar Wants. Nothing was done." });
        return j;
      }
      if (j) renderResult(j);
      return j;
    } catch {
      push({ kind: "fallback", id: uid(), title: "Couldn't reach Keplar", message: "The orchestrator is offline. Nothing was done on your behalf." });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const revealPinSetup = async (id: string) => {
    try {
      const r = await fetch("/api/keplar/wants/pin", { credentials: "same-origin" });
      const j = (await r.json().catch(() => null)) as { set?: boolean } | null;
      if (r.ok && j?.set === false) setCards((cs) => cs.map((c) => (c.kind === "pin" && c.id === id ? { ...c, setup: true } : c)));
    } catch {
      /* confirming still reports pin_not_set */
    }
  };

  const submit = async () => {
    const want = value.slice(P).trim();
    if (!want || busy) return;
    push({ kind: "user", id: uid(), text: PREFIX + want });
    setAndPlace(PREFIX);
    await callOrchestrate({ prompt: PREFIX + want });
  };

  const answer = async (card: Extract<Card, { kind: "question" }>, opt: string) => {
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...card, answered: opt } : c)));
    const lastUser = [...cards].reverse().find((c) => c.kind === "user");
    await callOrchestrate({ prompt: lastUser && lastUser.kind === "user" ? lastUser.text : PREFIX, answers: { [card.question]: opt } });
  };

  const confirmPin = async (card: Extract<Card, { kind: "pin" }>, ok: boolean) => {
    if (!ok) {
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...card, status: "cancelled" } : c)));
      push({ kind: "agent", id: uid(), text: "Cancelled. Nothing was submitted." });
      return;
    }
    const res = await callOrchestrate({ prompt: "confirm", confirmationId: card.id, pin: pins[card.id] ?? "" });
    if (!res || res.status === "error" || res.status === "timeout" || res.status === "fallback" || res.status === "refused") return;
    setCards((cs) => cs.map((c) => (c.kind === "pin" && c.id === card.id ? { ...c, status: "confirmed" } : c)));
  };

  const savePin = async (card: Extract<Card, { kind: "pin" }>) => {
    const pin = pins[card.id] ?? "";
    const r = await fetch("/api/keplar/wants/pin", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    const j = (await r.json().catch(() => null)) as { error?: string; note?: string; status?: string } | null;
    if (!r.ok) {
      push({ kind: "agent", id: uid(), text: j?.error ?? "That PIN wasn't saved. Nothing was done." });
      return;
    }
    push({ kind: "agent", id: uid(), text: j?.note ?? "PIN saved for your account. Confirm to continue." });
    setCards((cs) => cs.map((c) => (c.kind === "pin" && c.id === card.id ? { ...c, setup: false } : c)));
  };

  return (
    <div className={s.stage}>
      <aside className={s.tab} aria-label="Keplar Wants">
        <div className={s.aura} aria-hidden />
        <header className={s.head}>
          <span className={s.dot} />
          Keplar Wants
        </header>
        <div className={s.timeline} data-testid="timeline">
          {cards.length === 0 && <p className={s.empty}>Tell Keplar what you want. It asks before doing anything that matters.</p>}
          {cards.map((c) => {
            switch (c.kind) {
              case "user":
                return <div key={c.id} className={`${s.bubble} ${s.user}`}>{c.text}</div>;
              case "agent":
                return <div key={c.id} className={`${s.bubble} ${s.agent}`}>{c.text}{c.text.startsWith("Sign in") ? <> <Link className={s.signin} href="/signin?next=/app/wants">Sign in</Link></> : null}</div>;
              case "question":
                return (
                  <div key={c.id} className={s.card} data-testid="question-card">
                    <div className={s.label}>Quick question</div>
                    <div className={s.title}>{c.question}</div>
                    <div className={s.options}>
                      {c.options.map((o) => (
                        <button key={o} type="button" disabled={!!c.answered || busy} className={c.answered === o ? s.sel : ""} onClick={() => void answer(c, o)}>{o}</button>
                      ))}
                    </div>
                  </div>
                );
              case "pin":
                return (
                  <div key={c.id} className={s.card} data-testid="pin-card">
                    <div className={s.label}>Confirm with PIN</div>
                    <div className={s.title}>{c.summary}</div>
                    {c.status === "pending" ? (
                      <>
                        {c.setup && <p className={s.note}>Set a 4–6 digit PIN for this account. It is stored hashed, and nothing runs until you confirm.</p>}
                        <input className={s.pin} inputMode="numeric" maxLength={6} placeholder="••••" type="password" autoComplete="off" aria-label={c.setup ? "New PIN" : "PIN"} value={pins[c.id] ?? ""} onChange={(e) => setPins((p) => ({ ...p, [c.id]: e.target.value.replace(/\D/g, "") }))} />
                        <div className={s.options}>
                          {c.setup && <button type="button" className={s.primary} onClick={() => void savePin(c)}>Save PIN</button>}
                          <button type="button" className={s.primary} onClick={() => void confirmPin(c, true)} disabled={busy}>Confirm</button>
                          <button type="button" onClick={() => void confirmPin(c, false)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <div className={s.status}>{c.status}</div>
                    )}
                  </div>
                );
              case "fallback":
                return (
                  <div key={c.id} className={`${s.card} ${s.fallback}`} role="alert">
                    <div className={s.title}>{c.title}</div>
                    <p>{c.message}</p>
                  </div>
                );
            }
          })}
          {busy && <div className={`${s.bubble} ${s.agent}`}>…</div>}
        </div>
        <div className={s.row}>
          <input
            ref={inputRef}
            data-testid="want-input"
            className={s.input}
            value={value}
            spellCheck
            onChange={onChange}
            onKeyDown={onKeyDown}
            onCut={onCut}
            onPaste={onPaste}
            onDrop={onDrop}
            onBeforeInput={fixCaret}
            onSelect={fixCaret}
            onClick={fixCaret}
            onFocus={fixCaret}
            onCompositionStart={fixCaret}
            onCompositionUpdate={fixCaret}
            aria-label="I want"
          />
          <button type="button" className={`${s.mic} ${listening ? s.micOn : ""}`} onClick={toggleVoice} title="Dictate" aria-label="Voice dictation" aria-pressed={listening}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          <button type="button" className={s.send} onClick={() => void submit()} disabled={busy}>Go</button>
        </div>
      </aside>
    </div>
  );
}
