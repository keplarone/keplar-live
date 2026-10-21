"use client";
/**
 * A picture made in chat. One card, one state machine (message.image.phase):
 *   checking -> (confirm) -> working -> ready | failed        blocked / canceled end it early
 * What it asks the person: nothing for a cheap picture (the cost is on the card afterwards); the exact credits first for a costly
 * one or when a reference image is used. Everything it relies on is the server's: plan gate, daily caps, credits, refunds when a
 * picture fails (nothing is charged unless it is delivered), moderation and full-quality storage.
 */
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { SignInLink } from "../SignInLink";
import type { KeplarMessage, MessageMedia } from "../state/types";
import type { ChatImage } from "@/lib/images/chat-types";
import { blockedFrom, fetchStored, ImgError, needsApproval, newKey, quote, RIGHTS_TEXT, SIZE_LABEL, startImage, uploadSources, waitForJob } from "@/lib/images/chat-flow";
import type { SignedRef } from "@/lib/higgsfield/upload-client";
import { Lightbox } from "../Lightbox";
import { Button } from "@/components/kit";
import css from "./chat-image.module.css";
import la from "../link-action.module.css";

type Props = {
  message: KeplarMessage;
  /** The pictures the person attached to the message that asked (in memory only; gone after a reload). */
  media?: MessageMedia[];
  onPatch: (patch: Partial<ChatImage>) => void;
  onFollowUp: (f: { kind: "regenerate" | "variation" | "edit"; instruction?: string }) => void;
  onAskText: () => void;
  /** After a picture settles (made or failed): refresh the credits meter. */
  onSettled: () => void;
};

const SIZES: ChatImage["size"][] = ["1536x1024", "1024x1024", "1024x1536"];
const ratioOf = (s: ChatImage["size"]) => s.replace("x", " / ");
const credits = (n: number) => `${n.toLocaleString("en-US")} credit${n === 1 ? "" : "s"}`;

/** Signed references already uploaded for a card in this session (never persisted; a reload cancels an unstarted picture). */
const uploaded = new Map<string, SignedRef[]>();

async function sourceFiles(img: ChatImage, media?: MessageMedia[]): Promise<File[]> {
  if (img.ref?.from === "job") return [await fetchStored(img.ref.jobId)];
  const stills = (media ?? []).filter((m) => m.kind === "image").slice(0, 3);
  if (!stills.length) throw new ImgError("The attached image isn't kept after a reload. Attach it again in a new message.", 400, "bad_reference", {});
  const out: File[] = [];
  for (const m of stills) {
    // The original file (full quality). The small in-message copy is only a fallback and is labelled so by its size.
    const src = m.full ?? m.images?.[0]?.dataUrl;
    if (!src) throw new ImgError("The attached image isn't kept after a reload. Attach it again in a new message.", 400, "bad_reference", {});
    const blob = await (await fetch(src)).blob();
    out.push(new File([blob], m.name || "reference", { type: blob.type || "image/png" }));
  }
  return out;
}

export function ChatImageTurn({ message: m, media, onPatch, onFollowUp, onAskText, onSettled }: Props) {
  const img = m.image!;
  const uid = useId();
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [viewer, setViewer] = useState(false);
  const began = useRef("");
  const polled = useRef("");
  const patchRef = useRef(onPatch);
  const settledRef = useRef(onSettled);
  useEffect(() => { patchRef.current = onPatch; settledRef.current = onSettled; });

  const fail = (e: unknown) => {
    const blocked = blockedFrom(e);
    if (blocked) patchRef.current({ phase: "blocked", blocked });
    else patchRef.current({ phase: "failed", error: e instanceof Error ? e.message : "Couldn't make the picture. Nothing was charged." });
  };
  /** Starting failed. A 409 "confirm" means the price moved since it was quoted: show the new one for approval instead of failing. */
  const failOrConfirm = (e: unknown) => {
    const est = e instanceof ImgError && e.code === "confirm" ? (e.data.estimate as { units?: number } | undefined)?.units : undefined;
    if (typeof est === "number") patchRef.current({ phase: "confirm", estimateUnits: est, error: (e as Error).message });
    else fail(e);
  };

  /* checking: gate + exact cost. A cheap picture starts at once; otherwise the person approves. */
  const checkKey = img.phase === "checking" ? img.key : "";
  useEffect(() => {
    if (!checkKey || began.current === checkKey) return;
    began.current = checkKey;
    let live = true;
    (async () => {
      try {
        const q = await quote({ size: img.size, quality: img.quality, regenerateOf: img.regenerateOf, references: img.ref ? 1 : 0 });
        if (!live) return;
        if (needsApproval(q.units, Boolean(img.ref))) patchRef.current({ phase: "confirm", estimateUnits: q.units, left: q.left });
        else await run(q.units, q.left);
      } catch (e) {
        if (live) failOrConfirm(e);
      }
    })();
    // Reset `began` too: React StrictMode runs this effect twice in development and the first run's result is dropped (live is false),
    // so the second run must be allowed to check again. Only the free quote repeats; nothing is started before it resolves.
    return () => { live = false; began.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per check key
  }, [checkKey]);

  async function run(units: number, left: number | null) {
    let refs: SignedRef[] = uploaded.get(m.id) ?? [];
    if (img.ref && !refs.length) {
      refs = await uploadSources(await sourceFiles(img, media));
      uploaded.set(m.id, refs);
    }
    const job = await startImage({ prompt: img.prompt, size: img.size, quality: img.quality, key: img.key, confirmUnits: units, regenerateOf: img.regenerateOf, references: refs, rights });
    uploaded.delete(m.id);
    patchRef.current({ phase: job.status === "failed" ? "failed" : job.status === "ready" ? "ready" : "working", jobId: job.id, estimateUnits: units, left, ...(job.status === "ready" ? { url: job.url ?? undefined, units: job.units ?? undefined } : {}), ...(job.status === "failed" ? { error: job.error ?? undefined } : {}) });
  }

  async function approve() {
    if (busy || img.estimateUnits === undefined) return;
    if (img.ref && !rights) return;
    setBusy(true);
    try {
      await run(img.estimateUnits, img.left ?? null);
    } catch (e) {
      failOrConfirm(e);
    } finally {
      setBusy(false);
    }
  }

  async function resize(size: ChatImage["size"]) {
    patchRef.current({ size, error: undefined });
    try {
      const q = await quote({ size, quality: img.quality, regenerateOf: img.regenerateOf, references: img.ref ? 1 : 0 });
      patchRef.current({ estimateUnits: q.units, left: q.left });
    } catch (e) {
      fail(e);
    }
  }

  /* working: follow the job to its end (also after a reload, by job id). */
  const jobId = img.phase === "working" ? img.jobId : undefined;
  useEffect(() => {
    if (!jobId || polled.current === jobId) return;
    polled.current = jobId;
    const ctl = new AbortController();
    waitForJob(jobId, { signal: ctl.signal })
      .then((j) => {
        if (ctl.signal.aborted) return;
        if (!j) patchRef.current({ phase: "failed", error: "This is taking longer than expected. You're only charged if the picture is made. Try again in a minute." });
        else if (j.status === "ready") patchRef.current({ phase: "ready", url: j.url ?? undefined, units: j.units ?? undefined, error: undefined });
        else patchRef.current({ phase: "failed", error: j.error ?? "Couldn't make the picture. Nothing was charged." });
        settledRef.current();
      })
      .catch((e) => { if (!ctl.signal.aborted) { fail(e); settledRef.current(); } });
    return () => { ctl.abort(); polled.current = ""; };
  }, [jobId]);

  const kindWord = img.kind === "edit" ? "Edit" : img.kind === "variation" ? "Variation" : img.kind === "regenerate" ? "New version" : "Image";
  const ratio = { "--ratio": ratioOf(img.size) } as React.CSSProperties;

  return (
    <div className={css.card} data-testid="chat-image" data-phase={img.phase} role="group" aria-label={`${kindWord}: ${img.prompt.slice(0, 80)}`}>
      {img.asked && img.asked > 1 && img.phase !== "canceled" ? <p className={css.meta}>You asked for {img.asked}. Chat makes one picture at a time; use Variation for more, or Create &gt; Images for several at once.</p> : null}

      {img.phase === "checking" ? (
        <div className={css.frame}><div className={css.wait} style={ratio} role="status"><span className={css.pulse} aria-hidden="true" /><span className="visually-hidden">Checking your plan and the cost…</span></div></div>
      ) : null}

      {img.phase === "confirm" ? (
        <section className={css.panel} aria-labelledby={`${uid}-h`} data-testid="chat-image-confirm">
          <h3 id={`${uid}-h`}>{img.ref ? "Create a picture from your image?" : "Create this picture?"}</h3>
          <p className={css.prompt}>{img.prompt}</p>
          <p>
            This will use up to <strong className={css.cost} data-testid="chat-image-cost">{credits(img.estimateUnits ?? 0)}</strong>, and only if the picture is created. If it fails, nothing is charged.
            {typeof img.left === "number" ? ` You have ${img.left} picture${img.left === 1 ? "" : "s"} left today.` : ""}
          </p>
          {img.error ? <p className={css.error} role="alert">{img.error}</p> : null}
          <fieldset className={css.sizes}>
            <legend>Shape</legend>
            {SIZES.map((sz) => (
              <Button key={sz} size="sm" variant="secondary" className={css.chip} aria-pressed={img.size === sz} onClick={() => void resize(sz)}>{SIZE_LABEL[sz]}</Button>
            ))}
          </fieldset>
          {img.ref ? (
            <label className={css.rights}>
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
              <span>{RIGHTS_TEXT}</span>
            </label>
          ) : null}
          <div className={css.row}>
            <Button size="sm" variant="primary" disabled={busy || (Boolean(img.ref) && !rights)} onClick={() => void approve()}>{busy ? "Starting…" : `Create image · ${credits(img.estimateUnits ?? 0)}`}</Button>
            <Button size="sm" variant="secondary" onClick={() => { uploaded.delete(m.id); onPatch({ phase: "canceled", error: "Not started. Nothing was charged." }); }}>Cancel</Button>
          </div>
        </section>
      ) : null}

      {img.phase === "working" ? (
        <>
          <div className={css.frame}><div className={css.wait} style={ratio} role="status"><span className={css.pulse} aria-hidden="true" /><span>Creating your image…</span></div></div>
          <p className={css.meta}>{img.prompt}{typeof img.estimateUnits === "number" ? ` · up to ${credits(img.estimateUnits)}, only if it's created` : ""}</p>
        </>
      ) : null}

      {img.phase === "ready" && img.url ? (
        <>
          <figure className={css.frame}>
            <button type="button" onClick={() => setViewer(true)} aria-label="Open the image full size">
              {/* eslint-disable-next-line @next/next/no-img-element -- the stored original, served privately */}
              <img src={img.url} alt={img.prompt} data-testid="chat-image-result" />
            </button>
          </figure>
          <p className={css.meta}>{typeof img.units === "number" ? `${credits(img.units)} · ` : ""}{SIZE_LABEL[img.size]} · full quality original kept in your account</p>
          <div className={css.row}>
            <a className={la.act} data-variant="secondary" data-size="sm" href={`${img.url}?download=1`} download>Download original</a>
            <Button size="sm" variant="secondary" onClick={() => onFollowUp({ kind: "regenerate" })}>Regenerate</Button>
            <Button size="sm" variant="secondary" onClick={() => onFollowUp({ kind: "variation" })}>Variation</Button>
            <Button size="sm" variant="secondary" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>Edit</Button>
          </div>
          {editing ? (
            <form className={css.edit} onSubmit={(e) => { e.preventDefault(); if (instruction.trim().length >= 4) { onFollowUp({ kind: "edit", instruction: instruction.trim() }); setEditing(false); setInstruction(""); } }}>
              <input aria-label="What should change?" placeholder="What should change? e.g. make it night" value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={400} />
              <Button type="submit" size="sm" variant="primary" disabled={instruction.trim().length < 4}>Edit picture</Button>
            </form>
          ) : null}
          {viewer ? <Lightbox src={img.url} alt={img.prompt} caption={img.prompt} downloadHref={`${img.url}?download=1`} downloadName="keplar-image.png" onClose={() => setViewer(false)} /> : null}
        </>
      ) : null}

      {img.phase === "failed" ? (
        <section className={css.panel} role="alert" data-testid="chat-image-failed">
          <h3>That picture didn&apos;t work out</h3>
          <p>{img.error ?? "Nothing was charged."}</p>
          <div className={css.row}>
            <Button size="sm" variant="primary" onClick={() => onPatch({ phase: "checking", key: newKey(), error: undefined, jobId: undefined })}>Try again</Button>
            <Button size="sm" variant="secondary" onClick={onAskText}>Ask as a normal question</Button>
          </div>
        </section>
      ) : null}

      {img.phase === "blocked" && img.blocked ? (
        <section className={css.panel} role="alert" data-testid="chat-image-blocked" data-reason={img.blocked.reason}>
          <h3>{img.blocked.reason === "signin" ? "Sign in to create images" : img.blocked.reason === "plan" ? "Images are part of Plus and Pro" : img.blocked.reason === "limit" ? "That's today's limit" : img.blocked.reason === "credits" ? "Not enough credits" : "Images aren't available right now"}</h3>
          <p>{img.blocked.message}</p>
          <div className={css.row}>
            {img.blocked.reason === "signin" ? <SignInLink className={la.act} data-variant="primary" data-size="sm">Sign in</SignInLink> : null}
            {img.blocked.reason === "plan" || img.blocked.reason === "credits" ? <Link className={la.act} data-variant="primary" data-size="sm" href="/pricing">See plans</Link> : null}
            {img.blocked.reason === "paused" || img.blocked.reason === "config" ? <Button size="sm" variant="primary" onClick={() => onPatch({ phase: "checking", key: newKey(), blocked: undefined })}>Try again</Button> : null}
            <Button size="sm" variant="secondary" onClick={onAskText}>Ask as a normal question</Button>
          </div>
        </section>
      ) : null}

      {img.phase === "canceled" ? <p className={css.meta} data-testid="chat-image-canceled">{img.error ?? "Not started. Nothing was charged."}</p> : null}
    </div>
  );
}
