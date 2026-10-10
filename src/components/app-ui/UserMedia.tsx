"use client";
/** Images and video attached to a sent message: shown large and sharp (the original, not the tiny thumbnail), click to open full size. */
import { useState } from "react";
import { Lightbox } from "./Lightbox";
import { fmtClock } from "./media-client";
import type { MessageMedia } from "./state/types";
import css from "./UserMedia.module.css";

const srcOf = (m: MessageMedia) => m.full ?? (m.kind === "image" ? m.images?.[0]?.dataUrl : undefined) ?? m.thumb;

export function UserMedia({ media }: { media: MessageMedia[] }) {
  const [open, setOpen] = useState<MessageMedia | null>(null);
  const single = media.length === 1;
  return (
    <>
      <ul className={css.grid} data-single={single || undefined} aria-label="Attached media">
        {media.map((x) => {
          const src = srcOf(x);
          return (
            <li key={x.id} className={css.item}>
              {src ? (
                <button type="button" className={css.btn} onClick={() => (x.kind === "image" ? setOpen(x) : undefined)} data-viewable={x.kind === "image" || undefined} aria-label={x.kind === "image" ? `View ${x.name} full size` : `Video: ${x.name}`} title={x.kind === "image" ? "Click to view full size" : x.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- in-memory original */}
                  <img src={x.kind === "video" ? (x.thumb ?? src) : src} alt={x.kind === "video" ? `Video: ${x.name}` : `Image: ${x.name}`} />
                </button>
              ) : (
                <span className={css.gone} title="Media isn't kept after a reload">{x.kind === "video" ? "Video" : "Image"}</span>
              )}
              {x.kind === "video" ? <span className={css.badge}>{x.durationSec ? fmtClock(x.durationSec) : "Video"}{x.frames ? ` · ${x.frames} frames` : ""}</span> : null}
            </li>
          );
        })}
      </ul>
      {open && srcOf(open) ? <Lightbox src={srcOf(open)!} alt={open.name} caption={open.name} downloadHref={srcOf(open)} downloadName={open.name} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
