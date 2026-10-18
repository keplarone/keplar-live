"use client";
/**
 * The command composer: the request box, reference attachments (references.ts: images, video frames; up to 8 per request)
 * and the run controls (useStudioAgent): Build ↔ Stop / End run, Play test ↔ Stop test, Pause ↔ Continue, with MorphIcons
 * driven by the run's real state. Enter sends, Shift+Enter is a newline. Shows the credits this session used (real units).
 * Drafts offered elsewhere (an idea chip, an idea picked before connecting) fill the box once (draft.ts); nothing is sent
 * until the person chooses Build.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { solarMode, type SolarModeId } from "@/lib/studio/solar-modes";
import { referencesFromFiles } from "../references";
import type { useStudioAgent } from "../useStudioAgent";
import { ActivityIndicator, Button, IconButton, Icon, MorphIcon, Switch, srOnly } from "@/components/kit";
import { useEnterToSend } from "@/lib/use-enter-to-send";
import { MAX_REFS, appName, canBuild, controls, mergeRefs, placeholder, runState, sendIcon, type Env } from "./conversation-model";
import { peekDraft, subscribeDrafts, takeDraft } from "./draft";
import s from "./conversation.module.css";

type Agent = ReturnType<typeof useStudioAgent>;

export type ComposerProps = {
  a: Agent;
  env: Env;
  /** The overlay: one-line box, icon-only attach, no auto-approve switch (the conversation's approval bar has it). */
  compact?: boolean;
  /** The Solar mode this request runs on (the shell sends it with every turn); named on the Build button's tooltip. */
  mode: SolarModeId;
  /** Roblox Studio has a play test; Blender does not. */
  canPlayTest: boolean;
  /** The box's text length as the person types (0 after sending). */
  onTyping?: (n: number) => void;
};

/** The box grows with its text up to this many px, then scrolls. */
const MAX_BOX = { compact: 120, full: 200 } as const;

export function Composer({ a, env, compact = false, mode, canPlayTest, onTyping }: ComposerProps) {
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // A draft offered for this environment fills the box once (derived during render, then marked taken).
  const draft = useSyncExternalStore(subscribeDrafts, () => peekDraft(env), () => null);
  const [usedDraft, setUsedDraft] = useState(0);
  if (draft && draft.id !== usedDraft && !a.running) {
    setUsedDraft(draft.id);
    setText(draft.text);
  }
  useEffect(() => {
    if (!draft || draft.id !== usedDraft) return;
    takeDraft(env, draft.id);
    onTyping?.(draft.text.length);
    const el = boxRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, [draft, usedDraft, env, onTyping]);

  // The box grows with its content (no scrollbar until the cap).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? MAX_BOX.compact : MAX_BOX.full)}px`;
  }, [text, compact]);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setRefBusy(true);
    setRefErr("");
    try {
      const m = mergeRefs(refs, await referencesFromFiles([...files]));
      setRefs(m.refs);
      setRefErr(m.error);
    } catch (e) {
      setRefErr(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setRefBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [refs]);

  const submit = () => {
    if (!canBuild(text, refs.length, a)) return;
    const t = text;
    const r = refs;
    setText("");
    setRefs([]);
    setRefErr("");
    onTyping?.(0);
    void a.send(t, r);
  };
  const [inputRef, enter] = useEnterToSend({
    canSend: canBuild(text, refs.length, a),
    onSend: submit,
  });

  const c = controls(a, canPlayTest, Boolean(text.trim() || refs.length));
  const press = (action: "playtest" | "pause" | "resume" | "build" | "stop") => {
    if (action === "playtest") void a.playTest(!a.playing);
    else if (action === "pause") a.pause();
    else if (action === "resume") void a.resume();
    else if (action === "stop") a.stop();
  };
  const status = runState(a, env);
  const label = solarMode(mode).label;

  return (
    <form className={s.composer} data-compact={compact || undefined} aria-label="Request" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {refs.length ? (
        <div className={s.pending} role="group" aria-label="References for this request">
          {refs.map((src, i) => (
            <button key={i} type="button" className={s.thumb} onClick={() => setRefs((r) => r.filter((_, j) => j !== i))} aria-label={`Remove reference ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local reference preview (data URL) */}
              <img src={src} alt="" />
              <span className={s.thumbX} aria-hidden="true"><Icon name="close" size={12} /></span>
            </button>
          ))}
          <span className={s.refCount}>{refs.length}/{MAX_REFS}</span>
        </div>
      ) : null}
      {refErr ? <p className={s.refErr} role="status"><Icon name="warning" size={12} />{refErr}</p> : null}

      <textarea
        ref={(node) => { boxRef.current = node; inputRef(node); }}
        className={s.box}
        rows={compact ? 1 : 2}
        value={text}
        placeholder={placeholder(a, env)}
        enterKeyHint={enter.enterKeyHint}
        onChange={(e) => { setText(e.target.value); onTyping?.(e.target.value.length); }}
        onKeyDown={enter.onKeyDown}
        onBeforeInput={enter.onBeforeInput}
        aria-label={`Describe what to build in ${appName(env)}`}
        disabled={a.running}
      />

      <div className={s.bar}>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        {refBusy ? (
          <span className={s.reading}><ActivityIndicator label="Reading the reference" size={12} /><span aria-hidden="true">Reading…</span></span>
        ) : (
          <IconButton label="Add a reference image or clip" icon={<Icon name="attach" />} size="sm"
            disabled={a.running || refs.length >= MAX_REFS} onClick={() => fileRef.current?.click()} />
        )}

        <span className={s.run} title={status}>
          <MorphIcon icon="send" state={sendIcon(a)} size={14} />
          <span className={s.runText}>{status}</span>
        </span>
        <span className={s.credits}>
          <Icon name="credit" size={12} />
          {a.units.toLocaleString()}<span className={compact ? srOnly : undefined}> credits used</span>
        </span>

        {compact ? null : <Switch checked={a.autoApprove} onCheckedChange={a.setAuto} label="Auto-approve safe changes" />}

        <span className={s.grow} />

        {c.play ? (
          <Button size="sm" variant={c.play.primary ? "primary" : "secondary"} aria-pressed={c.play.pressed} disabled={c.play.disabled}
            onClick={() => press(c.play!.action)} leadingIcon={<MorphIcon icon="play" state={c.play.icon} size={14} />}>
            {c.play.label}
          </Button>
        ) : null}
        <Button size="sm" type={c.build.action === "build" ? "submit" : "button"} variant={c.build.primary ? "primary" : "secondary"}
          disabled={c.build.disabled} title={c.build.title ?? (c.build.action === "build" ? `Build with Solar 5.8 · ${label}` : undefined)}
          onClick={c.build.action === "build" ? undefined : () => press(c.build.action)}
          leadingIcon={<MorphIcon icon="build" state={c.build.icon} size={14} />}>
          {c.build.label}
        </Button>
      </div>
    </form>
  );
}
