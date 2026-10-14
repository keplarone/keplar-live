"use client";
/**
 * Your apps: every app as a card with what it looks like (the tester's screenshot, or a poster in the app's own palette and
 * display face when there is none yet), its state, and one-click Open, Refine, Duplicate and Publish.
 */
import { memo } from "react";
import s from "./studio.module.css";
import type { AppSummary } from "./types";
import { Button } from "@/components/kit";

type Props = {
  apps: AppSummary[];
  busy: Record<string, string>;
  onOpen: (id: string) => void;
  onRefine: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPublish: (id: string) => void;
};

const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString();
};

function Poster({ app }: { app: AppSummary }) {
  const l = app.look;
  const name = app.name || app.appName || "Untitled";
  return (
    <span className={s.poster} style={l ? { background: l.bg, color: l.ink } : undefined} aria-hidden="true">
      <span className={s.posterName} style={l ? { fontFamily: l.display } : undefined}>{name}</span>
      <span className={s.posterBar} style={l ? { background: l.accent } : undefined} />
      <span className={s.posterKind}>{app.kind ?? "app"}</span>
    </span>
  );
}

export const AppShelf = memo(function AppShelf({ apps, busy, onOpen, onRefine, onDuplicate, onPublish }: Props) {
  if (!apps.length) return null;
  return (
    <section className={s.shelf} aria-labelledby="kc-shelf-h">
      <div className={s.shelfHead}>
        <h2 id="kc-shelf-h" className={s.shelfTitle}>Your apps</h2>
        <span className={s.shelfCount}>{apps.length}</span>
      </div>
      <ul className={s.shelfGrid}>
        {apps.map((a) => {
          const published = a.publishedVersion !== null && a.publishedVersion !== undefined;
          const behind = published && a.headVersion > (a.publishedVersion ?? 0);
          const b = busy[a.id];
          const name = a.name || a.appName || "Untitled";
          return (
            <li key={a.id} className={s.card}>
              <button type="button" className={s.cardHit} onClick={() => onOpen(a.id)} aria-label={`Open ${name}`}>
                <span className={s.thumb}>
                  {a.thumb ? <img src={a.thumb} alt="" loading="lazy" decoding="async" /> : <Poster app={a} />}
                </span>
              </button>
              <div className={s.cardBody}>
                <div className={s.cardRow}>
                  <span className={s.cardName}>{name}</span>
                  <span className={s.badge} data-tone={published ? (behind ? "warn" : "ok") : undefined}>{published ? (behind ? "Update ready" : "Live") : a.headVersion ? "Draft" : "Empty"}</span>
                </div>
                <span className={s.cardMeta}>{[a.kind, a.headVersion ? `v${a.headVersion}` : "", ago(a.updatedAt)].filter(Boolean).join(" · ")}</span>
                <div className={s.cardActions}>
                  <Button variant="ghost" size="sm" onClick={() => onOpen(a.id)}>Open</Button>
                  {a.headVersion ? <Button variant="ghost" size="sm" onClick={() => onRefine(a.id)}>Refine</Button> : null}
                  <Button variant="ghost" size="sm" onClick={() => onDuplicate(a.id)} loading={b === "duplicate"} disabled={Boolean(b)}>{b === "duplicate" ? "Copying…" : "Duplicate"}</Button>
                  {a.headVersion && (!published || behind) ? <Button variant="ghost" size="sm" onClick={() => onPublish(a.id)} loading={b === "publish"} disabled={Boolean(b)}>{b === "publish" ? "Publishing…" : behind ? "Publish update" : "Publish"}</Button> : null}
                  {published && a.liveUrl ? <a className={s.textBtn} href={a.liveUrl} target="_blank" rel="noopener">Visit</a> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
