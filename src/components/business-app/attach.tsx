"use client";
/**
 * Images and video in Business prompts: the same preparation as Keplar One's composer (media-client.ts: images fitted to the
 * request budget, a video sampled into timestamped frames), the same limits (4 images, 1 video per message), sent to the
 * engine as `media`. Files stay in the browser until Send and are never stored by Keplar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPT, fmtSize, kindOf, prepareImage, prepareVideo, VideoTooLongError, UNSUPPORTED, type ComposerMedia } from "@/components/app-ui/media-client";
import { MEDIA_LIMITS, type MediaInput } from "@/lib/orchestration/media";
import { useScreenShare } from "@/components/app-ui/screen-share";
import s from "./cursor.module.css";

const MB = 1024 * 1024;
/** The request's media part from ready items (as Keplar One's Composer#toMediaInput, without loading the Composer). */
function toMediaInput(items: ComposerMedia[]): MediaInput | undefined {
  const images = items.flatMap((m) => m.images);
  if (!images.length) return undefined;
  const videos = items.filter((m) => m.kind === "video" && m.images.length).map((m) => ({ name: m.name, durationSec: m.durationSec ?? 0, frames: m.images.length }));
  return { images, videos };
}

const newId = () => `bm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type MediaAttach = {
  items: ComposerMedia[];
  error: string;
  busy: boolean;
  add: (files: FileList | File[]) => void;
  remove: (id: string) => void;
  /** The ready media for a request (undefined when none), and clears the tray. */
  take: () => MediaInput | undefined;
};

export function useMediaAttach(): MediaAttach {
  const [items, setItems] = useState<ComposerMedia[]>([]);
  const [error, setError] = useState("");
  const ref = useRef<ComposerMedia[]>([]);
  useEffect(() => { ref.current = items; }, [items]);
  useEffect(() => () => { for (const m of ref.current) if (m.full) URL.revokeObjectURL(m.full); }, []);

  const add = useCallback((list: FileList | File[]) => {
    const errs: string[] = [];
    let images = ref.current.filter((m) => m.kind === "image").length;
    let videos = ref.current.filter((m) => m.kind === "video").length;
    const accepted: { file: File; id: string; kind: "image" | "video" }[] = [];
    for (const f of [...list]) {
      const kind = kindOf(f);
      if (!kind) { errs.push(`${f.name}: ${UNSUPPORTED}`); continue; }
      if (kind === "image") {
        if (images >= MEDIA_LIMITS.maxImages) { errs.push(`Up to ${MEDIA_LIMITS.maxImages} images per message, so ${f.name} wasn't added.`); continue; }
        if (f.size > MEDIA_LIMITS.maxImageBytes) { errs.push(`${f.name} is ${fmtSize(f.size)}. Images can be up to ${MEDIA_LIMITS.maxImageBytes / MB} MB.`); continue; }
        images++;
      } else {
        if (videos >= MEDIA_LIMITS.maxVideos) { errs.push(`One video per message, so ${f.name} wasn't added.`); continue; }
        if (f.size > MEDIA_LIMITS.maxVideoBytes) { errs.push(`${f.name} is ${fmtSize(f.size)}. Videos can be up to ${MEDIA_LIMITS.maxVideoBytes / MB} MB.`); continue; }
        videos++;
      }
      accepted.push({ file: f, id: newId(), kind });
    }
    setError(errs.join(" "));
    if (!accepted.length) return;
    setItems((prev) => [...prev, ...accepted.map(({ file, id, kind }): ComposerMedia => ({ id, kind, name: file.name, bytes: file.size, status: "processing", images: [] }))]);
    for (const a of accepted) {
      const patch = (p: Partial<ComposerMedia>) => setItems((prev) => prev.map((m) => (m.id === a.id ? { ...m, ...p } : m)));
      const drop = (msg: string) => { setItems((prev) => prev.filter((m) => m.id !== a.id)); setError((e) => `${e ? `${e} ` : ""}${msg}`); };
      if (a.kind === "image") {
        // Each image gets an even share of the request budget so four large photos still fit in one message.
        prepareImage(a.file, Math.floor(MEDIA_LIMITS.maxTotalDataUrlChars / MEDIA_LIMITS.maxImages) - 20_000)
          .then((r) => patch({ ...r, status: "ready" }))
          .catch(() => drop(`${a.file.name} couldn't be read as an image.`));
      } else {
        prepareVideo(a.file, (done, total) => patch({ progress: total ? done / total : undefined }))
          .then((r) => patch({ ...r, status: "ready", progress: undefined }))
          .catch((e) => drop(e instanceof VideoTooLongError ? `${a.file.name} is longer than ${MEDIA_LIMITS.maxVideoSeconds / 60} minutes. Trim it and attach it again.` : `${a.file.name} couldn't be read as a video. Try MP4 or WebM.`));
      }
    }
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((m) => m.id === id);
      if (gone?.full) URL.revokeObjectURL(gone.full);
      return prev.filter((m) => m.id !== id);
    });
    setError("");
  }, []);

  const take = useCallback(() => {
    const ready = ref.current.filter((m) => m.status === "ready");
    const media = toMediaInput(ready);
    setItems([]);
    setError("");
    return media;
  }, []);

  return { items, error, busy: items.some((m) => m.status !== "ready"), add, remove, take };
}

/** The paperclip button (opens the file picker). */
export function AttachButton({ media, disabled }: { media: MediaAttach; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={s.roundBtn} onClick={() => input.current?.click()} disabled={disabled} aria-label="Attach images or a video" title="Attach images or a video">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></svg>
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files?.length) media.add(e.target.files); e.target.value = ""; }} />
    </>
  );
}

/** What is attached, above the prompt: previews, progress for a video, remove buttons, and any problem in words. */
export function MediaTray({ media }: { media: MediaAttach }) {
  if (!media.items.length && !media.error) return null;
  return (
    <div className={s.mediaTray}>
      {media.items.length ? (
        <ul className={s.mediaList} aria-label="Attachments">
          {media.items.map((m) => (
            <li key={m.id} className={s.mediaItem} data-kind={m.kind}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: preview */}
              {m.thumb ? <img src={m.thumb} alt="" className={s.mediaThumb} /> : <span className={s.mediaThumb} aria-hidden="true" />}
              <span className={s.mediaMeta}>
                <span className={s.mediaName}>{m.name}</span>
                <span className={s.mediaSub}>
                  {m.status !== "ready" ? (m.kind === "video" ? `Reading frames${m.progress !== undefined ? ` ${Math.round(m.progress * 100)}%` : "…"}` : "Preparing…") : m.kind === "video" ? `Video · ${m.images.length} frames` : `Image · ${fmtSize(m.bytes)}`}
                </span>
              </span>
              <button type="button" className={s.mediaRemove} onClick={() => media.remove(m.id)} aria-label={`Remove ${m.name}`}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      {media.error ? <p className={s.mediaError} role="alert">{media.error}</p> : null}
    </div>
  );
}

/** Dropping or pasting files onto a prompt attaches the images and video among them. */
export function mediaHandlers(media: MediaAttach) {
  const pick = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => kindOf(f));
  return {
    onPaste: (e: React.ClipboardEvent) => { const f = pick(e.clipboardData?.files); if (f.length) { e.preventDefault(); media.add(f); } },
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { const f = pick(e.dataTransfer?.files); if (f.length) { e.preventDefault(); media.add(f); } },
  };
}

/**
 * Share screen (Keplar Vision, src/components/app-ui/screen-share.ts): the person picks a screen, window or tab in the browser's
 * (or the desktop app's) own picker; each Capture attaches a frame as an ordinary image, and an unchanged screen isn't sent twice.
 * Sharing ends on Stop, from the system's own sharing bar, or after 15 minutes. Nothing is captured in the background.
 */
export function useShare(media: MediaAttach) {
  const [note, setNote] = useState("");
  const share = useScreenShare(useCallback((f: File) => media.add([f]), [media]), setNote);
  return { ...share, note, clearNote: () => setNote("") };
}

export function ShareButton({ share, disabled }: { share: ReturnType<typeof useShare>; disabled?: boolean }) {
  return (
    <button type="button" className={s.roundBtn} data-on={share.active || undefined} onClick={() => void share.start()} disabled={disabled} aria-label={share.active ? "Capture the shared screen" : "Share your screen"} title={share.active ? "Capture the shared screen" : "Share your screen"}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
    </button>
  );
}

/** Shown above the prompt while sharing: what is shared, Capture and Stop. Notes (nothing changed, cancelled) appear here too. */
export function ShareBar({ share }: { share: ReturnType<typeof useShare> }) {
  if (!share.active && !share.note) return null;
  return (
    <div className={s.shareBar} role="status">
      {share.active ? <span className={s.shareLive} aria-hidden="true" /> : null}
      <span className={s.shareText}>{share.active ? `Sharing ${share.label} with Keplar${share.note ? ` · ${share.note}` : ""}` : share.note}</span>
      {share.active ? (
        <>
          <button type="button" className={s.shareBtn} onClick={() => void share.capture()}>Capture</button>
          <button type="button" className={s.shareBtn} onClick={share.stop}>Stop sharing</button>
        </>
      ) : <button type="button" className={s.shareBtn} onClick={share.clearNote} aria-label="Dismiss">OK</button>}
    </div>
  );
}
