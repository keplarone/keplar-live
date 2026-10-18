"use client";
/**
 * A clip asked for in chat. No mode of its own: a clear "make a video of…" request lands here.
 *   checking → options (shape and length still open) or straight into the job when both were named
 *   options  → Create video
 *   confirm  → only when the quoted job is large enough that the pipeline requires a second yes
 *   working  → "Making your video…", then ready | failed. Cancel stops a job still in flight.
 * Plan, credits and the file are the server's. A plan that cannot make video gets a short note and a link to plans.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import type { KeplarMessage } from "../state/types";
import type { ChatAspect } from "@/lib/video/chat-intent";
import type { ChatVideo } from "@/lib/video/chat-types";
import { chatVideoOffer, outputMatches, planVideoQuestions, readVideoPrefs, writeVideoPrefs } from "@/lib/video/chat-offer";
import { blockedFrom, cancelVideo, chatModel, loadVideoConfig, newVideoKey, quoteVideo, startVideo, VIDEO_PLAN_MESSAGE, waitForVideo, type Started } from "@/lib/video/chat-flow";
import { ActivityIndicator, Button, Progress } from "@/components/kit";
import css from "./chat-video.module.css";
import la from "../link-action.module.css";

type Props = {
  message: KeplarMessage;
  onPatch: (patch: Partial<ChatVideo>) => void;
  onAskText: () => void;
  onSettled: () => void;
};

const ASPECT_LABEL: Record<ChatAspect, string> = { "16:9": "16:9 · Landscape", "9:16": "9:16 · Vertical" };
const credits = (n: number) => `${n.toLocaleString("en-US")} credit${n === 1 ? "" : "s"}`;

export function ChatVideoTurn({ message: m, onPatch, onAskText, onSettled }: Props) {
  const v = m.video!;
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const began = useRef("");
  const polled = useRef("");
  const patchRef = useRef(onPatch);
  const settledRef = useRef(onSettled);
  useEffect(() => { patchRef.current = onPatch; settledRef.current = onSettled; });

  const fail = (e: unknown) => {
    const blocked = blockedFrom(e);
    if (blocked) patchRef.current({ phase: "blocked", blocked });
    else patchRef.current({ phase: "failed", error: e instanceof Error ? e.message : "Couldn't make the video. Nothing was charged." });
  };

  const go = async (aspect: ChatAspect, durationSec: number, modelId: string, acknowledgeLarge = false) => {
    setBusy(true);
    try {
      writeVideoPrefs(aspect, durationSec);
      const quote = acknowledgeLarge && typeof v.estimateUnits === "number"
        ? { units: v.estimateUnits, large: true, durationSec, aspectRatio: aspect, modelId }
        : await quoteVideo({ prompt: v.prompt, aspect, durationSec, modelId });
      if (quote.durationSec !== durationSec) {
        patchRef.current({ phase: "failed", error: `That model can't make a ${durationSec}s clip. Nothing was charged.`, aspect, durationSec, modelId });
        return;
      }
      if (quote.large && !acknowledgeLarge) {
        patchRef.current({ phase: "confirm", aspect, durationSec, modelId, estimateUnits: quote.units, large: true, error: undefined });
        return;
      }
      patchRef.current({ phase: "working", aspect, durationSec, modelId, estimateUnits: quote.units, status: "queued", error: undefined, mismatch: undefined });
      const job = await startVideo({ prompt: v.prompt, aspect, durationSec, modelId, key: v.key, confirmUnits: quote.units, acknowledgeLarge: quote.large });
      patchRef.current({ jobId: job.id, status: job.status, ...(job.status === "failed" || job.status === "blocked" ? { phase: "failed", error: job.error ?? "Couldn't make the video. Nothing was charged." } : {}) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      settledRef.current();
    }
  };

  const checkKey = v.phase === "checking" ? v.key : "";
  useEffect(() => {
    if (!checkKey || began.current === checkKey) return;
    began.current = checkKey;
    let live = true;
    (async () => {
      try {
        const config = await loadVideoConfig();
        if (!live) return;
        if (!config.available) {
          patchRef.current({ phase: "blocked", blocked: { reason: "plan", message: config.message || VIDEO_PLAN_MESSAGE, upgradeTo: config.upgradeTo ?? "pro" } });
          return;
        }
        if (!config.configured) {
          patchRef.current({ phase: "blocked", blocked: { reason: "config", message: "Video generation isn't connected yet." } });
          return;
        }
        const model = chatModel(config);
        const offer = model ? chatVideoOffer({ durations: model.durations ?? undefined, aspectRatios: model.aspectRatios }, config.maxSeconds) : { aspects: [], durations: [] };
        const questions = planVideoQuestions({ aspect: v.statedAspect, durationSec: v.statedDuration }, offer, readVideoPrefs());
        if (!model || !questions) {
          patchRef.current({ phase: "blocked", blocked: { reason: "config", message: "Video generation has no length this plan can make." } });
          return;
        }
        if (!live) return;
        const base = { aspects: offer.aspects, durations: offer.durations, aspect: questions.aspect, durationSec: questions.duration, modelId: model.id };
        if (questions.ready) await go(questions.aspect, questions.duration, model.id);
        else patchRef.current({ phase: "options", ...base });
      } catch (e) {
        if (live) fail(e);
      } finally {
        if (live) settledRef.current();
      }
    })();
    return () => { live = false; began.current = ""; };
    // The key is the run. stated* are fixed for this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const finish = (j: Started | null) => {
    if (!j) {
      patchRef.current({ phase: "failed", error: "This is taking longer than expected. Nothing is charged unless the clip is delivered. Try again in a minute." });
      settledRef.current();
      return;
    }
    if (j.status === "completed" && j.url) {
      const askedAspect = v.aspect;
      const askedDuration = v.durationSec;
      const paramsOff = (askedAspect && j.params.aspectRatio !== askedAspect) || (askedDuration && j.params.durationSec !== askedDuration);
      patchRef.current({
        phase: "ready", url: j.url, units: j.units ?? undefined, status: j.status, error: undefined,
        ...(paramsOff ? { mismatch: `The generator used ${j.params.aspectRatio}${j.params.durationSec ? `, ${j.params.durationSec}s` : ""}. You asked for ${askedAspect ?? ""}${askedDuration ? `, ${askedDuration}s` : ""}.` } : {}),
      });
    } else if (j.error && /canceled/i.test(j.error)) {
      patchRef.current({ phase: "canceled", error: "Canceled. Nothing was charged." });
    } else {
      patchRef.current({ phase: "failed", error: j.error ?? "Couldn't make the video. Nothing was charged." });
    }
    settledRef.current();
  };

  const jobId = v.phase === "working" ? v.jobId ?? "" : "";
  useEffect(() => {
    if (!jobId || polled.current === jobId) return;
    polled.current = jobId;
    const ctl = new AbortController();
    void waitForVideo(jobId, {
      signal: ctl.signal,
      onTick: (j) => patchRef.current({ status: j.status }),
    }).then((j) => {
      if (ctl.signal.aborted) return;
      finish(j);
    }).catch((e) => { if (!ctl.signal.aborted) { fail(e); settledRef.current(); } });
    return () => { ctl.abort(); polled.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const ratio = { "--ratio": (v.aspect ?? "16:9").replace(":", " / ") } as CSSProperties;
  const aspects = v.aspects ?? [];
  const durations = v.durations ?? [];
  const questions = planVideoQuestions({ aspect: v.statedAspect, durationSec: v.statedDuration }, { aspects, durations }, {});
  const showAspect = v.phase === "options" && (questions?.askAspect ?? true);
  const showDuration = v.phase === "options" && (questions?.askDuration ?? true);

  const move = (e: KeyboardEvent<HTMLFieldSetElement>, values: string[], current: string | undefined, set: (value: string) => void) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = Math.max(0, values.indexOf(current ?? ""));
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = values[(i + dir + values.length) % values.length];
    set(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next)}"]`)?.focus();
  };

  const submitOptions = () => {
    if (!v.aspect || !v.durationSec || !v.modelId) return;
    void go(v.aspect, v.durationSec, v.modelId);
  };

  return (
    <div className={css.card} data-testid="chat-video" data-phase={v.phase} role="group" aria-label={`Video: ${v.prompt.slice(0, 80)}`}>
      {v.phase === "checking" ? (
        <div className={css.frame}><div className={css.wait} style={ratio} role="status"><ActivityIndicator label="Checking your plan" showLabel /></div></div>
      ) : null}

      {v.phase === "options" && v.aspect && v.durationSec ? (
        <form
          className={css.panel}
          aria-labelledby={`${uid}-h`}
          data-testid="chat-video-options"
          onSubmit={(e) => { e.preventDefault(); submitOptions(); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if ((e.target as HTMLElement).closest?.("[data-cancel]")) return;
            e.preventDefault();
            submitOptions();
          }}
        >
          <h3 id={`${uid}-h`}>Make this video</h3>
          <p className="visually-hidden">Arrow keys change the highlighted choice. Enter creates the video.</p>
          <p className={css.prompt}>{v.prompt}</p>
          {!showAspect && v.aspect ? <p className={css.meta}>Shape · {ASPECT_LABEL[v.aspect]}</p> : null}
          {showAspect ? (
            <fieldset className={css.choices} role="radiogroup" aria-label="Aspect ratio" onKeyDown={(e) => move(e, aspects, v.aspect, (value) => onPatch({ aspect: value as ChatAspect }))}>
              <legend>Shape</legend>
              {aspects.map((a) => (
                <Button key={a} type="button" size="sm" variant="secondary" className={css.chip} role="radio" aria-checked={v.aspect === a} tabIndex={v.aspect === a ? 0 : -1} data-value={a} autoFocus={showAspect && v.aspect === a} onClick={() => onPatch({ aspect: a })}>{ASPECT_LABEL[a]}</Button>
              ))}
            </fieldset>
          ) : null}
          {!showDuration && v.durationSec ? <p className={css.meta}>Length · {v.durationSec}s</p> : null}
          {showDuration ? (
            <fieldset className={css.choices} role="radiogroup" aria-label="Length" onKeyDown={(e) => move(e, durations.map(String), String(v.durationSec), (value) => onPatch({ durationSec: Number(value) }))}>
              <legend>Length</legend>
              {durations.map((d) => (
                <Button key={d} type="button" size="sm" variant="secondary" className={css.chip} role="radio" aria-checked={v.durationSec === d} tabIndex={v.durationSec === d ? 0 : -1} data-value={String(d)} autoFocus={!showAspect && v.durationSec === d} onClick={() => onPatch({ durationSec: d })}>{d}s</Button>
              ))}
            </fieldset>
          ) : null}
          <div className={css.row}>
            <Button type="submit" size="sm" variant="primary" disabled={busy}>{busy ? "Starting…" : "Create video"}</Button>
            <Button type="button" size="sm" variant="secondary" data-cancel="" onClick={() => onPatch({ phase: "canceled", error: "Not started. Nothing was charged." })}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {v.phase === "confirm" ? (
        <form className={css.panel} data-testid="chat-video-confirm" onSubmit={(e) => { e.preventDefault(); if (v.aspect && v.durationSec && v.modelId) void go(v.aspect, v.durationSec, v.modelId, true); }}>
          <h3>Create this video?</h3>
          <p className={css.prompt}>{v.prompt}</p>
          <p>This is a large job: up to <strong>{credits(v.estimateUnits ?? 0)}</strong>, and only if the clip is created. {v.aspect} · {v.durationSec}s.</p>
          <div className={css.row}>
            <Button type="submit" size="sm" variant="primary" disabled={busy}>{busy ? "Starting…" : `Create video · ${credits(v.estimateUnits ?? 0)}`}</Button>
            <Button type="button" size="sm" variant="secondary" data-cancel="" onClick={() => onPatch({ phase: "canceled", error: "Not started. Nothing was charged." })}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {v.phase === "working" ? (
        <div className={css.frame}>
          <div className={css.wait} style={ratio} role="status">
            <ActivityIndicator label="Making your video" showLabel />
            <Progress max={3} value={v.status === "running" ? 2 : 1} label="Making your video" valueText={v.status === "running" ? "Rendering" : "Queued"} />
            <div className={css.row}>
              <Button size="sm" variant="secondary" onClick={() => {
                const id = v.jobId;
                onPatch({ phase: "canceled", error: "Canceled. Nothing was charged." });
                if (id) void cancelVideo(id).catch(() => undefined);
              }}>Cancel</Button>
            </div>
          </div>
        </div>
      ) : null}

      {v.phase === "ready" && v.url ? (
        <>
          <figure className={css.frame}>
            <video
              src={v.url}
              controls
              playsInline
              preload="metadata"
              data-testid="chat-video-result"
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (!v.aspect || !v.durationSec) return;
                const match = outputMatches({ aspect: v.aspect, durationSec: v.durationSec }, { width: el.videoWidth, height: el.videoHeight, durationSec: el.duration });
                if (match.pending || (match.aspect && match.duration)) return;
                const got = `${el.videoWidth}×${el.videoHeight}, ${Math.round(el.duration)}s`;
                onPatch({ mismatch: `This file is ${got}. You asked for ${v.aspect}, ${v.durationSec}s.` });
              }}
            />
          </figure>
          <p className={css.meta}>{typeof v.units === "number" ? `${credits(v.units)} · ` : ""}{v.aspect} · {v.durationSec}s</p>
          {v.mismatch ? <p className={css.error} role="status" data-testid="chat-video-mismatch">{v.mismatch}</p> : null}
          <div className={css.row}>
            <a className={la.act} data-variant="secondary" data-size="sm" href={v.url} download="keplar-video.mp4">Download</a>
          </div>
        </>
      ) : null}

      {v.phase === "failed" ? (
        <section className={css.panel} role="alert" data-testid="chat-video-failed">
          <h3>That video didn&apos;t work out</h3>
          <p>{v.error ?? "Nothing was charged."}</p>
          <div className={css.row}>
            <Button size="sm" variant="primary" onClick={() => onPatch({ phase: "checking", key: newVideoKey(), error: undefined, jobId: undefined, url: undefined, mismatch: undefined })}>Try again</Button>
            <Button size="sm" variant="secondary" onClick={onAskText}>Ask as a normal question</Button>
          </div>
        </section>
      ) : null}

      {v.phase === "blocked" && v.blocked ? (
        <section className={css.panel} role="status" data-testid="chat-video-blocked" data-reason={v.blocked.reason}>
          <h3>{v.blocked.reason === "signin" ? "Sign in to create videos" : v.blocked.reason === "plan" || v.blocked.reason === "credits" ? "Video is part of Pro and Business" : v.blocked.reason === "limit" ? "That's today's limit" : "Video isn't available right now"}</h3>
          <p>{v.blocked.message}</p>
          <div className={css.row}>
            {v.blocked.reason === "signin" ? <Link className={la.act} data-variant="primary" data-size="sm" href="/signin?next=%2Fapp">Sign in</Link> : null}
            {v.blocked.reason === "signin" || v.blocked.reason === "plan" || v.blocked.reason === "credits" ? <Link className={la.act} data-variant="secondary" data-size="sm" href="/pricing">See plans</Link> : null}
            {v.blocked.reason === "paused" || v.blocked.reason === "config" ? <Button size="sm" variant="primary" onClick={() => onPatch({ phase: "checking", key: newVideoKey(), blocked: undefined })}>Try again</Button> : null}
            <Button size="sm" variant="secondary" onClick={onAskText}>Ask as a normal question</Button>
          </div>
        </section>
      ) : null}

      {v.phase === "canceled" ? <p className={css.meta} data-testid="chat-video-canceled">{v.error ?? "Not started. Nothing was charged."}</p> : null}
    </div>
  );
}
