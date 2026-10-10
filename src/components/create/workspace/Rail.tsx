"use client";
import { brand } from "@/lib/site";
import { SiteTrash } from "../delete/DeleteSiteDialog";
import d from "../delete/delete-site.module.css";
import s from "./ws.module.css";

export type RailSite = { id: string; name: string; headVersion: number; publishedVersion: number | null; archived?: boolean; updatedAt: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Left rail: New chat, then the projects. Each project is one site with its own chat. */
export function Rail({ sites, currentId, canCreate, busy, meter, planLabel, open, onNew, onPick, onClose, onDelete }: {
  sites: RailSite[]; currentId: string | null; canCreate: boolean; busy: boolean; meter: { used: number; total: number | null } | null; planLabel: string; open: boolean;
  onNew: () => void; onPick: (id: string) => void; onClose: () => void;
  /** Opens the delete confirmation for a site. */
  onDelete: (site: { id: string; name: string }) => void;
}) {
  const visible = sites.filter((x) => !x.archived);
  const pct = meter?.total ? Math.min(100, (meter.used / meter.total) * 100) : 0;
  return (
    <>
      {open ? <button type="button" className={s.railScrim} aria-label="Close the project list" onClick={onClose} /> : null}
      <nav className={`${s.rail} ${open ? s.railOpen : ""}`} aria-label="Projects">
        <button type="button" className={s.newChat} onClick={() => { onNew(); onClose(); }} disabled={busy || !canCreate} title={canCreate ? "Start a new project" : "You've reached your plan's site limit"}>
          <span aria-hidden="true">+</span> New chat
        </button>
        <p className={s.railLabel}>Projects</p>
        <ul className={s.projects}>
          {visible.length === 0 ? <li className={s.railEmpty}>Nothing yet. Describe a site and it appears here.</li> : null}
          {visible.map((x) => (
            <li key={x.id} className={d.row}>
              <button type="button" className={s.project} aria-current={x.id === currentId ? "true" : undefined} onClick={() => { onPick(x.id); onClose(); }} disabled={busy && x.id !== currentId}>
                <span className={s.projectName}>{x.name}</span>
                <small>{x.publishedVersion !== null ? "Live" : x.headVersion > 0 ? "Draft" : "Not built"} · {when(x.updatedAt)}</small>
              </button>
              <SiteTrash id={x.id} name={x.name} onClick={() => onDelete({ id: x.id, name: x.name })} disabled={busy && x.id === currentId} />
            </li>
          ))}
        </ul>
        <div className={s.railFoot}>
          <span className={s.muted}>{brand.engineName} · {planLabel}</span>
          {meter?.total ? (
            <>
              <span className={s.meterTrack} aria-hidden="true"><span className={s.meterFill} style={{ width: `${pct}%` }} /></span>
              <small className={s.muted}>{meter.used.toLocaleString()} / {meter.total.toLocaleString()} credits</small>
            </>
          ) : null}
        </div>
      </nav>
    </>
  );
}
