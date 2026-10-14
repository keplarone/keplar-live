"use client";
/**
 * The row of attachment chips above a composer (Ask and Create). One chip language for everything Keplar reads: links show
 * the site's icon and host, images and videos a thumbnail, documents a typed tile (PDF, DOC, XLS, CODE …). Chips show the
 * real stage and progress while they're read, a quiet warning when something was only partly read, open a full-size viewer
 * for images, and ease out when removed. Animation is transform/opacity only and is off under prefers-reduced-motion. It
 * never touches the text box, so typing stays instant.
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import { IconClose } from "./icons";
import { GLYPH, GlyphWarn } from "./attach-glyphs";
import { KIND_BADGE, type AttachKind } from "@/lib/attachments/kinds";
import { IconButton } from "@/components/kit";
import css from "./AttachTray.module.css";

export type TrayItem = {
  id: string;
  name: string;
  kind: AttachKind | "file";
  thumb?: string;
  status: "processing" | "ready" | "warn" | "error";
  /** Second line, e.g. "PDF · 12 pages", "Reading…". */
  sub: string;
  /** 0..1 when known; processing without it shows an indeterminate sweep. */
  progress?: number;
  badge?: string;
  /** Openable in the viewer. */
  viewable?: boolean;
  /** Links: site icon, host and the address to open. */
  favicon?: string;
  host?: string;
  href?: string;
  /** Shown on hover and to screen readers (warnings, notes). */
  note?: string;
  /** Create references: colors read from the reference. */
  swatches?: string[];
};

const LEAVE_MS = 180;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** "en.wikipedia.org" → "W": the registrable name's first letter, not a language or www subdomain. */
const siteInitial = (host: string) => {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  const name = parts.length >= 3 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2 ? parts[parts.length - 3] : parts[Math.max(0, parts.length - 2)] ?? host;
  return (name || host).charAt(0).toUpperCase();
};

function Tile({ m }: { m: TrayItem }) {
  const [iconOk, setIconOk] = useState(true);
  if (m.thumb) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory preview */}
        <img src={m.thumb} alt="" />
        {m.badge ? <span className={css.badge}>{m.badge}</span> : null}
      </>
    );
  }
  if (m.kind === "link") {
    return m.favicon && iconOk ? (
      // eslint-disable-next-line @next/next/no-img-element -- third-party favicon, tiny, no layout shift
      <img className={css.favicon} src={m.favicon} alt="" width={18} height={18} referrerPolicy="no-referrer" onError={() => setIconOk(false)} />
    ) : (
      <span className={css.initial}>{siteInitial(m.host ?? m.name)}</span>
    );
  }
  if (m.status === "processing" && (m.kind === "image" || m.kind === "video")) return <span className={css.pending} aria-hidden="true" />;
  const Glyph = GLYPH[m.kind] ?? GLYPH.text;
  const label = m.kind === "file" ? "FILE" : KIND_BADGE[m.kind];
  return (
    <span className={css.typeTile} data-kind={m.kind}>
      <Glyph size={14} />
      <span className={css.typeLabel}>{label}</span>
    </span>
  );
}

export const AttachTray = forwardRef<HTMLUListElement, { items: TrayItem[]; onRemove: (id: string) => void; onOpen?: (id: string) => void; label?: string }>(function AttachTray({ items, onRemove, onOpen, label = "Attachments" }, ref) {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const remove = (id: string) => {
    if (reduced()) return onRemove(id);
    setLeaving((p) => new Set(p).add(id));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setLeaving((p) => { const n = new Set(p); n.delete(id); return n; });
      onRemove(id);
    }, LEAVE_MS));
  };

  if (!items.length) return null;
  return (
    <ul ref={ref} className={css.tray} aria-label={label}>
      {items.map((m) => {
        const openable = m.viewable && m.status !== "processing" && onOpen;
        return (
          <li key={m.id} className={css.item} data-kind={m.kind} data-status={m.status} data-processing={m.status === "processing" || undefined} data-leaving={leaving.has(m.id) || undefined} title={m.note ?? undefined}>
            {openable ? (
              <button type="button" className={`${css.thumb} ${css.thumbBtn}`} onClick={() => onOpen!(m.id)} aria-label={`View ${m.name} full size`}>
                <Tile m={m} />
              </button>
            ) : (
              <span className={css.thumb} data-link={m.kind === "link" || undefined}>
                <Tile m={m} />
              </span>
            )}
            <span className={css.meta}>
              {m.href && m.status !== "processing" ? (
                <a className={css.name} href={m.href} target="_blank" rel="noreferrer noopener">{m.name}</a>
              ) : (
                <span className={css.name}>{m.name}</span>
              )}
              <span className={css.sub}>
                {m.status === "warn" || m.status === "error" ? <GlyphWarn size={11} className={css.warnIcon} /> : null}
                <span>{m.sub}</span>
              </span>
              {m.swatches?.length ? (
                <span className={css.swatches} aria-label={`Colors: ${m.swatches.join(", ")}`}>
                  {m.swatches.slice(0, 6).map((c) => <span key={c} style={{ background: c }} />)}
                </span>
              ) : null}
              {m.note ? <span className="visually-hidden">{m.note}</span> : null}
            </span>
            <IconButton size="sm" className={css.remove} tooltip={false} data-remove="" label={`Remove ${m.name}`} onClick={() => remove(m.id)} icon={<IconClose size={12} />} />
            {m.status === "processing" ? (
              <span className={css.bar} role="progressbar" aria-label={`Reading ${m.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.progress === undefined ? undefined : Math.round(m.progress * 100)}>
                <span className={m.progress === undefined ? css.sweep : css.fill} style={m.progress === undefined ? undefined : { transform: `scaleX(${Math.max(0.04, Math.min(1, m.progress))})` }} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
});
