"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { referencesFromFiles } from "./references";
import { SolarCore } from "./SolarCore";
import { solarPulse, solarState } from "./solar-state";
import { StudioTopUp } from "./StudioTopUp";
import { describeAction, type Item, type StudioAgent } from "./useStudioAgent";
import s from "./studio-mode.module.css";

const RISK_LABEL = { read: "Look", change: "Change", destructive: "Needs care" } as const;
const STATUS_LABEL = { waiting: "Waiting for you", running: "Working…", done: "Done", failed: "Failed", skipped: "Skipped" } as const;
const MAX_REFS = 8;
/** Starting points for the overlay's empty state. They only fill the box; nothing is sent until the person chooses Build. */
const IDEAS = {
  studio: ["A lava obby with checkpoints", "A shop UI with coins", "A day and night cycle", "Better lighting for this place"],
  blender: ["A low-poly tree set", "Studio lighting for this model", "Worn metal materials", "A stylised rock pile"],
} as const;

/** The Build button leans a little toward the pointer (a few pixels at most) and springs back. */
function magnetic(e: ReactPointerEvent<HTMLButtonElement>) {
  const el = e.currentTarget;
  if (el.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--tx", `${(((e.clientX - r.left) / r.width) - 0.5) * 6}px`);
  el.style.setProperty("--ty", `${(((e.clientY - r.top) / r.height) - 0.5) * 5}px`);
}
function unmagnet(e: ReactPointerEvent<HTMLButtonElement>) {
  e.currentTarget.style.removeProperty("--tx");
  e.currentTarget.style.removeProperty("--ty");
}

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
export function StudioDock({ a, compact = false, draft = "", onDraftUsed, canPlayTest = true, onTyping }: { a: StudioAgent; compact?: boolean; draft?: string; onDraftUsed?: () => void; /** Roblox Studio has a play test; Blender does not. */ canPlayTest?: boolean; /** The overlay's Solar core reacts to typing (the draft's length). */ onTyping?: (length: number) => void }) {
  const [text, setText] = useState(draft);
  const [sent, setSent] = useState(0);
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
    onTyping?.(0);
    setSent((n) => n + 1);
    void a.send(t, r);
  };

  return (
    <section className={s.dock} data-compact={compact || undefined} aria-label="Build with Keplar in Roblox Studio">
      {compact ? null : (
        <div className={s.dockBar}>
          {/* Once a build has started, the Solar strip below shows the state. */}
          {a.items.length ? null : (
            <span className={s.runState} data-running={a.running || undefined}>
              <span className={s.runDot} aria-hidden="true" />
              {a.looking ? "Looking at your place…" : a.running ? (a.current ? `Building · step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning…") : a.paused ? "Paused" : a.finished ? "Finished" : "Ready"}
            </span>
          )}
          <span className={s.grow} />
          <label className={s.switch}>
            <input type="checkbox" role="switch" checked={a.autoApprove} onChange={(e) => a.setAuto(e.target.checked)} />
            <span>Auto-approve safe changes</span>
          </label>
          {a.items.length ? <button type="button" className={s.textBtn} onClick={a.reset} disabled={a.running}>New session</button> : null}
        </div>
      )}

      {/* One core for the whole session: a hero above the empty state, then a strip while a build runs (one WebGL scene, never re-created). */}
      {compact ? null : (
        <div className={s.pageStage} data-mode={a.items.length ? "strip" : "hero"}>
          <SolarCore state={solarState(a, text.length)} pulse={solarPulse(a)} className={s.pageCore} />
          {a.items.length ? (
            <span className={s.pageStageText}>
              <strong>{a.looking ? "Looking at your place" : a.running ? (a.current ? `Building step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning") : a.paused ? "Paused" : a.finished ? "Finished" : "Ready"}</strong>
              <span>Solar 5.8 Ultra{a.plan.length ? ` · ${a.plan.filter((p) => p.state === "done").length} of ${a.plan.length} steps` : ""}</span>
            </span>
          ) : null}
        </div>
      )}
      <StudioTopUp />
      <ol className={s.feed} ref={listRef} aria-live="polite">
        {a.items.length === 0 ? (
          <li className={s.empty}>
            <strong>What should we build?</strong>
            {canPlayTest
              ? <span>Keplar looks at your place first, then plans and builds; you play-test it and say what to change. Attach screenshots or a clip of a UI, effect or gameplay you want to match. Each game&apos;s chat is saved, so you can come back to it.</span>
              : <span>Keplar reads your scene first, then plans, models and textures it; you look it over and say what to change. Attach reference images of the look you want. Each file&apos;s chat is saved, so you can come back to it.</span>}
            {(
              <span className={s.ideas} role="group" aria-label="Ideas to start from">
                {IDEAS[canPlayTest ? "studio" : "blender"].map((idea, i) => (
                  <button key={idea} type="button" className={s.ideaChip} style={{ ["--i" as string]: i }} onClick={() => { setText(idea); onTyping?.(idea.length); }}>{idea}</button>
                ))}
              </span>
            )}
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

      <form className={s.composer} data-sent={sent ? (sent % 2 ? "a" : "b") : undefined} onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
          onChange={(e) => { setText(e.target.value); onTyping?.(e.target.value.length); }}
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
              <button type="button" className={s.primary} data-morph="stop" onClick={a.stop}>Stop</button>
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
              <button type="submit" className={s.primary} data-morph="build" onPointerMove={magnetic} onPointerLeave={unmagnet} disabled={a.playing || (!text.trim() && !refs.length)} title={a.playing ? "Stop the play test, then build" : undefined}>Build</button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
