"use client";

import { useEffect, useRef, useState } from "react";
import type { StudioBridge } from "@/lib/desktop/studio-bridge";
import { referencesFromFiles } from "./references";
import { describeAction, useStudioAgent, type Item } from "./useStudioAgent";
import s from "./studio-mode.module.css";

const RISK_LABEL = { read: "Look", change: "Change", destructive: "Needs care" } as const;
const STATUS_LABEL = { waiting: "Waiting for you", running: "Working…", done: "Done", failed: "Failed", skipped: "Skipped" } as const;
const BUDGETS = [500, 1500, 3000, 6000];
const MAX_REFS = 8;

function ActionCard({ it, onDecide }: { it: Extract<Item, { kind: "action" }>; onDecide: (ok: boolean) => void }) {
  const code = it.name === "execute_luau" && typeof it.args.code === "string" ? it.args.code : null;
  return (
    <li className={s.action} data-status={it.status} data-risk={it.risk}>
      <div className={s.actionHead}>
        <span className={s.actionDot} aria-hidden="true" />
        <span className={s.actionTitle}>{describeAction(it.name, it.args)}</span>
        <span className={s.riskTag} data-risk={it.risk}>{RISK_LABEL[it.risk]}</span>
        <span className={s.actionStatus}>{STATUS_LABEL[it.status]}</span>
      </div>
      {code && it.status === "waiting" ? <pre className={s.code}>{code.slice(0, 4000)}</pre> : null}
      {it.summary && it.status !== "waiting" ? <p className={s.actionSummary}>{it.summary}</p> : null}
      {it.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio, shown as is
        <img className={s.shot} src={it.image} alt="Studio screenshot" />
      ) : null}
      {it.status === "waiting" ? (
        <div className={s.actionButtons}>
          <button type="button" className={s.primary} onClick={() => onDecide(true)}>{it.risk === "destructive" ? "Approve this change" : "Approve"}</button>
          <button type="button" className={s.ghost} onClick={() => onDecide(false)}>Skip</button>
        </div>
      ) : null}
    </li>
  );
}

/** The Studio co-creator's chat dock (run loop: useStudioAgent). Shown once Keplar is connected to Studio. */
export function StudioDock({ bridge }: { bridge: StudioBridge }) {
  const a = useStudioAgent(bridge);
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a.items.length]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setRefBusy(true);
    setRefErr("");
    try {
      const next = await referencesFromFiles([...files]);
      setRefs((r) => [...r, ...next].slice(0, MAX_REFS));
      if (refs.length + next.length > MAX_REFS) setRefErr(`Up to ${MAX_REFS} reference images per request (a video counts as 6 frames).`);
    } catch (e) {
      setRefErr(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setRefBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = () => {
    if (!text.trim() && !refs.length) return;
    const t = text;
    const r = refs;
    setText("");
    setRefs([]);
    void a.send(t, r);
  };

  return (
    <section className={s.dock} aria-label="Build with Keplar in Roblox Studio">
      <div className={s.dockBar}>
        <span className={s.meta}>{a.units.toLocaleString()} of {a.budget.toLocaleString()} credits this run</span>
        <label className={s.budget}>
          Budget
          <select value={a.budget} onChange={(e) => a.setRunBudget(Number(e.target.value))}>
            {BUDGETS.map((b) => <option key={b} value={b}>{b.toLocaleString()}</option>)}
          </select>
        </label>
        <label className={s.switch}>
          <input type="checkbox" role="switch" checked={a.autoApprove} onChange={(e) => a.setAuto(e.target.checked)} />
          <span>Auto-approve safe changes</span>
        </label>
        {a.items.length ? <button type="button" className={s.textBtn} onClick={a.reset} disabled={a.running}>New session</button> : null}
      </div>

      <ol className={s.feed} ref={listRef} aria-live="polite">
        {a.items.length === 0 ? (
          <li className={s.empty}>
            <strong>What should we build?</strong>
            <span>Try “Make a sci-fi city with flying cars and neon signs”, or attach screenshots or a clip of a UI, effect or gameplay you want to match.</span>
          </li>
        ) : null}
        {a.items.map((it) =>
          it.kind === "user" ? (
            <li key={it.key} className={s.userMsg}>
              {it.text ? <p>{it.text}</p> : null}
              {it.images.length ? (
                <div className={s.refRow}>
                  {it.images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- local reference preview
                    <img key={i} src={src} alt={`Reference ${i + 1}`} />
                  ))}
                </div>
              ) : null}
            </li>
          ) : it.kind === "keplar" ? (
            <li key={it.key} className={s.keplarMsg}><p>{it.text}</p></li>
          ) : it.kind === "note" ? (
            <li key={it.key} className={s.note} data-tone={it.tone}>{it.text}</li>
          ) : (
            <ActionCard key={it.key} it={it} onDecide={(ok) => a.decide(it.key, ok)} />
          ),
        )}
      </ol>

      <form className={s.composer} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {refs.length ? (
          <div className={s.refRow}>
            {refs.map((src, i) => (
              <button key={i} type="button" className={s.refThumb} onClick={() => setRefs((r) => r.filter((_, j) => j !== i))} aria-label={`Remove reference ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local reference preview */}
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        ) : null}
        {refErr ? <p className={s.refErr} role="status">{refErr}</p> : null}
        <textarea
          className={s.input}
          rows={2}
          value={text}
          placeholder={a.running ? "Keplar is working. You can pause or stop." : "Describe what to build or change…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !a.running) { e.preventDefault(); submit(); } }}
          aria-label="Describe what to build in Roblox Studio"
          disabled={a.running}
        />
        <div className={s.composerBar}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <button type="button" className={s.ghost} onClick={() => fileRef.current?.click()} disabled={a.running || refBusy || refs.length >= MAX_REFS}>{refBusy ? "Reading…" : "Add reference"}</button>
          <span className={s.grow} />
          {a.running ? (
            <>
              <button type="button" className={s.ghost} onClick={a.pause}>Pause</button>
              <button type="button" className={s.ghost} onClick={a.stop}>Stop</button>
            </>
          ) : a.paused ? (
            <>
              <button type="button" className={s.ghost} onClick={a.stop}>End run</button>
              <button type="button" className={s.primary} onClick={() => void a.resume()}>Continue</button>
            </>
          ) : (
            <button type="submit" className={s.primary} disabled={!text.trim() && !refs.length}>Build</button>
          )}
        </div>
      </form>
    </section>
  );
}
