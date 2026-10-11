"use client";

import { useEffect, useRef, useState } from "react";
import { referencesFromFiles } from "./references";
import { StudioTopUp } from "./StudioTopUp";
import { describeAction, type Item, type StudioAgent } from "./useStudioAgent";
import s from "./studio-mode.module.css";

const RISK_LABEL = { read: "Look", change: "Change", destructive: "Needs care" } as const;
const STATUS_LABEL = { waiting: "Waiting for you", running: "Working…", done: "Done", failed: "Failed", skipped: "Skipped" } as const;
const MAX_REFS = 8;

function ActionCard({ it, onDecide, compact }: { it: Extract<Item, { kind: "action" }>; onDecide: (ok: boolean) => void; compact: boolean }) {
  const code = it.name === "execute_luau" && typeof it.args.code === "string" ? it.args.code : null;
  const uploads = it.name === "upload_image" && Array.isArray(it.args.imagePaths) ? it.args.imagePaths.filter((x): x is string => typeof x === "string") : [];
  const [showCode, setShowCode] = useState(!compact);
  return (
    <li className={s.action} data-status={it.status} data-risk={it.risk}>
      <div className={s.actionHead}>
        <span className={s.actionDot} aria-hidden="true" />
        <span className={s.actionTitle}>{describeAction(it.name, it.args)}</span>
        {compact ? null : <span className={s.riskTag} data-risk={it.risk}>{RISK_LABEL[it.risk]}</span>}
        <span className={s.actionStatus}>{STATUS_LABEL[it.status]}</span>
      </div>
      {code && it.status === "waiting" && showCode ? <pre className={s.code}>{code.slice(0, 4000)}</pre> : null}
      {uploads.length && it.status === "waiting" ? (
        <ul className={s.uploadList}>
          {uploads.map((src) => (
            <li key={src}><a href={src} target="_blank" rel="noreferrer noopener" title={src}>{src.replace(/^https:\/\//, "").slice(0, 90)}</a></li>
          ))}
        </ul>
      ) : null}
      {it.summary && it.status !== "waiting" && !compact ? <p className={s.actionSummary}>{it.summary}</p> : null}
      {it.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio, shown as is
        <img className={s.shot} src={it.image} alt="Studio screenshot" />
      ) : null}
      {it.status === "waiting" ? (
        <div className={s.actionButtons}>
          <button type="button" className={s.primary} onClick={() => onDecide(true)}>{it.risk === "destructive" ? "Approve this change" : "Approve"}</button>
          <button type="button" className={s.ghost} onClick={() => onDecide(false)}>Skip</button>
          {code && compact ? <button type="button" className={s.quiet} onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>{showCode ? "Hide script" : "See script"}</button> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The Studio co-creator's chat dock (run loop: useStudioAgent, passed in so the side panel shares it). Shown once Keplar is
 * connected to Studio, on the Studio page and, compact, in the desktop overlay.
 */
export function StudioDock({ a, compact = false, draft = "", onDraftUsed, canPlayTest = true }: { a: StudioAgent; compact?: boolean; draft?: string; onDraftUsed?: () => void; /** Roblox Studio has a play test; Blender does not. */ canPlayTest?: boolean }) {
  const [text, setText] = useState(draft);
  const [refs, setRefs] = useState<string[]>([]);
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a.items.length]);

  // An idea picked before connecting arrives as a draft; it fills the box once.
  useEffect(() => {
    if (!draft) return;
    queueMicrotask(() => { setText(draft); onDraftUsed?.(); });
  }, [draft, onDraftUsed]);

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
    <section className={s.dock} data-compact={compact || undefined} aria-label="Build with Keplar in Roblox Studio">
      {compact ? null : (
        <div className={s.dockBar}>
          <span className={s.runState} data-running={a.running || undefined}>
            <span className={s.runDot} aria-hidden="true" />
            {a.looking ? "Looking at your place…" : a.running ? (a.current ? `Building · step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning…") : a.paused ? "Paused" : a.finished ? "Finished" : "Ready"}
          </span>
          <span className={s.grow} />
          <label className={s.switch}>
            <input type="checkbox" role="switch" checked={a.autoApprove} onChange={(e) => a.setAuto(e.target.checked)} />
            <span>Auto-approve safe changes</span>
          </label>
          {a.items.length ? <button type="button" className={s.textBtn} onClick={a.reset} disabled={a.running}>New session</button> : null}
        </div>
      )}

      <StudioTopUp />
      <ol className={s.feed} ref={listRef} aria-live="polite">
        {a.items.length === 0 ? (
          <li className={s.empty}>
            <span className={s.orbit} aria-hidden="true"><span /><span /><span /></span>
            <strong>What should we build?</strong>
            <span>Keplar looks at your place first, then plans and builds; you play-test it and say what to change. Attach screenshots or a clip of a UI, effect or gameplay you want to match. Each game&apos;s chat is saved, so you can come back to it.</span>
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
          ) : it.kind === "look" ? (
            <li key={it.key} className={s.lookItem}>
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio
                <img src={it.image} alt="What Keplar saw in Studio" />
              ) : <span className={s.lookIcon} aria-hidden="true" />}
              <span><strong>Looked at your place</strong><br />{it.text}</span>
            </li>
          ) : it.kind === "note" ? (
            <li key={it.key} className={s.note} data-tone={it.tone}>{it.text}</li>
          ) : (
            <ActionCard key={it.key} it={it} compact={compact} onDecide={(ok) => a.decide(it.key, ok)} />
          ),
        )}
        {/* Typing dots while Keplar is thinking (running, and not busy with or waiting on a Studio step). */}
        {a.running && !a.items.some((x) => x.kind === "action" && (x.status === "running" || x.status === "waiting")) ? (
          <li className={s.typing} aria-label={a.looking ? "Keplar is looking at your place" : "Keplar is thinking"}><span /><span /><span /></li>
        ) : null}
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
          rows={compact ? 1 : 2}
          value={text}
          placeholder={a.running ? "Keplar is working. You can pause or stop." : a.playing ? "Play-testing. Note what to change, then stop the test and build." : a.items.length ? "Change something or add to it…" : "Describe what to build or change…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !a.running) { e.preventDefault(); submit(); } }}
          aria-label="Describe what to build in Roblox Studio"
          disabled={a.running}
        />
        <div className={s.composerBar}>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <button type="button" className={s.ghost} data-icon={compact || undefined} onClick={() => fileRef.current?.click()} disabled={a.running || refBusy || refs.length >= MAX_REFS} aria-label={compact ? "Add a reference image or clip" : undefined}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>
            {compact ? null : refBusy ? "Reading…" : "Add reference"}
          </button>
          {compact ? <span className={s.meta}>{a.units.toLocaleString()} credits used</span> : null}
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
            <>
              {/* The person play-tests (Studio directly, no model call): the model no longer spends turns testing its own work. */}
              {canPlayTest && a.items.length ? (
                <button type="button" className={s.ghost} aria-pressed={a.playing} onClick={() => void a.playTest(!a.playing)}>
                  {a.playing ? "Stop test" : "Play test"}
                </button>
              ) : null}
              <button type="submit" className={s.primary} disabled={a.playing || (!text.trim() && !refs.length)} title={a.playing ? "Stop the play test, then build" : undefined}>Build</button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
