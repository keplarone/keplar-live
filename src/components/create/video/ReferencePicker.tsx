"use client";
/**
 * Reference image / video picker (shared by the image and video studios).
 * - Shows only the reference types the selected model(s) accept.
 * - Validates type, size and (video) length in the browser before anything is sent; the server validates again.
 * - Uploads the ORIGINAL file (never re-encoded): files up to 3 MB go through a Keplar function, larger ones go straight from
 *   the browser to storage with a presigned URL, so the 4.5 MB request cap never limits quality.
 * - Preview with a remove button, plus the rights and consent confirmation.
 */
import { useEffect, useId, useRef, useState } from "react";
import s from "./video.module.css";
import { uploadReference, type SignedRef } from "@/lib/higgsfield/upload-client";

export { uploadReference };
export type { SignedRef };

export type RefLimits = {
  image: { types: string[]; maxBytes: number; max: number };
  video: { types: string[]; maxBytes: number; minSec: number; maxSec: number };
  inlineMaxBytes: number;
  rightsNote: string;
};
export type RefItem = { id: string; kind: "image" | "video"; name: string; preview: string; status: "uploading" | "ready" | "error"; error?: string; ref?: SignedRef };

const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("couldn't read the video")); };
    v.src = url;
  });
}

type Props = {
  limits: RefLimits;
  /** Reference types the selected model(s) take. A type that is false is not offered. */
  accepts: { image: boolean; video: boolean };
  maxImages: number;
  items: RefItem[];
  onChange: (items: RefItem[]) => void;
  rights: boolean;
  onRights: (v: boolean) => void;
  /** For output length that follows the source video: the longest allowed source, seconds. */
  maxSourceSec?: number;
  disabled?: boolean;
  label?: string;
};

const newId = () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

export function ReferencePicker({ limits, accepts, maxImages, items, onChange, rights, onRights, maxSourceSec, disabled, label = "Reference" }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const accept = [...(accepts.image ? limits.image.types : []), ...(accepts.video ? limits.video.types : [])].join(",");
  const none = !accepts.image && !accepts.video;
  if (none && items.length === 0) return null;

  const set = (next: RefItem[]) => { itemsRef.current = next; onChange(next); };
  const patch = (rid: string, p: Partial<RefItem>) => set(itemsRef.current.map((x) => (x.id === rid ? { ...x, ...p } : x)));

  async function add(files: FileList | null) {
    setMsg(null);
    if (!files) return;
    for (const file of Array.from(files)) {
      const kind: "image" | "video" | null = limits.image.types.includes(file.type) ? "image" : limits.video.types.includes(file.type) ? "video" : null;
      const cur = itemsRef.current;
      if (!kind || !accepts[kind]) { setMsg(kind === "video" ? "This model doesn't take a reference video." : kind === "image" ? "This model doesn't take a reference image." : `${file.name}: use ${accepts.image ? "JPEG, PNG or WebP images" : ""}${accepts.image && accepts.video ? " or " : ""}${accepts.video ? "MP4 video" : ""}.`); continue; }
      const L = limits[kind];
      if (file.size > L.maxBytes) { setMsg(`${file.name} is ${mb(file.size)}. The limit is ${mb(L.maxBytes)}.`); continue; }
      if (kind === "image" && cur.filter((x) => x.kind === "image").length >= maxImages) { setMsg(`Up to ${maxImages} reference image${maxImages === 1 ? "" : "s"}.`); continue; }
      if (kind === "video" && cur.some((x) => x.kind === "video")) { setMsg("One reference video at a time. Remove the current one first."); continue; }
      let dur: number | undefined;
      if (kind === "video") {
        try { dur = await readDuration(file); } catch { setMsg(`${file.name} couldn't be read as a video.`); continue; }
        if (dur < limits.video.minSec) { setMsg(`Reference videos must be at least ${limits.video.minSec} seconds (this one is ${dur.toFixed(1)} s).`); continue; }
        const cap = Math.min(limits.video.maxSec, maxSourceSec ?? limits.video.maxSec);
        if (dur > cap) { setMsg(`Reference videos can be up to ${cap} seconds here (this one is ${Math.round(dur)} s).`); continue; }
      }
      const rid = newId();
      const preview = URL.createObjectURL(file);
      set([...itemsRef.current, { id: rid, kind, name: file.name, preview, status: "uploading" }]);
      try {
        const ref = await uploadReference(file, kind, dur);
        patch(rid, { status: "ready", ref });
      } catch (e) {
        patch(rid, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
    if (input.current) input.current.value = "";
  }

  function remove(rid: string) {
    const gone = itemsRef.current.find((x) => x.id === rid);
    if (gone) URL.revokeObjectURL(gone.preview);
    set(itemsRef.current.filter((x) => x.id !== rid));
  }

  const types = [accepts.image ? "JPEG, PNG or WebP" : "", accepts.video ? `MP4 (${limits.video.minSec}–${Math.min(limits.video.maxSec, maxSourceSec ?? limits.video.maxSec)} s)` : ""].filter(Boolean).join(" · ");
  return (
    <fieldset className={s.ref} aria-label={label} disabled={disabled}>
      <legend>{label} <span className={s.opt}>optional{accepts.video && !accepts.image ? "" : ""}</span></legend>
      {none ? <p className={s.hint} role="status">The selected model ignores references. Remove them, or pick a model that uses them.</p> : null}
      {none ? null : <input ref={input} id={`${id}-file`} type="file" accept={accept} multiple={accepts.image && maxImages > 1} className="visually-hidden" onChange={(e) => void add(e.target.files)} data-testid="reference-input" />}
      {none ? null : <label htmlFor={`${id}-file`} className={s.pick}>Add {accepts.image && accepts.video ? "an image or video" : accepts.image ? "an image" : "a video"}</label>}
      {none ? null : <span className={s.hint}>{types}. Uploaded at full quality; images up to {mb(limits.image.maxBytes)}, video up to {mb(limits.video.maxBytes)}.</span>}
      {items.length ? (
        <ul className={s.thumbs} aria-label="Attached references">
          {items.map((x) => (
            <li key={x.id} className={s.thumb} data-status={x.status}>
              {x.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={x.preview} alt={x.name} />
              ) : (
                <video src={x.preview} muted playsInline aria-label={x.name} />
              )}
              <span className={s.thumbName}>{x.name}</span>
              <span className={s.thumbState} role="status">{x.status === "uploading" ? "Uploading…" : x.status === "error" ? x.error : "Ready"}</span>
              <button type="button" className={s.remove} onClick={() => remove(x.id)} aria-label={`Remove ${x.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
      {msg ? <p className={s.err} role="alert">{msg}</p> : null}
      {items.length ? (
        <label className={s.rights}>
          <input type="checkbox" checked={rights} onChange={(e) => onRights(e.target.checked)} />
          <span>{limits.rightsNote}</span>
        </label>
      ) : null}
    </fieldset>
  );
}
