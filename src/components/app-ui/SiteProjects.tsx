"use client";
/**
 * Projects: the sites you've built, as real project cards. Thumbnail (a sandboxed, script-free render of the latest
 * version), status, versions, leads, last change, quick resume into Create, rename, duplicate, archive, and a
 * per-project drawer with real activity (versions, publishing, leads) and artifacts (live URL, ZIP, leads CSV).
 * Everything shown comes from the account's own sites; nothing is inferred.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeleteSiteDialog, SiteUndo } from "@/components/create/delete/DeleteSiteDialog";
import { useSiteDelete } from "@/components/create/delete/useSiteDelete";
import { ShareTemplate, type MyTemplate } from "./ShareTemplate";
import { Button, SegmentedControl, Tooltip } from "@/components/kit";
import s from "./views.module.css";
import css from "./SiteProjects.module.css";
import la from "./link-action.module.css";

type Site = {
  id: string; name: string; slug: string; headVersion: number; publishedVersion: number | null; publishedUrl: string | null;
  needsReview: boolean; takenDown: boolean; leadCount: number; updatedAt: string; createdAt?: string; archived?: boolean; thumbUrl?: string | null; duplicatedFrom?: string | null;
};
type Ev = { at: string; type: string; title: string; detail?: string; version?: number; units?: number };
type Act = { events: Ev[]; versions: { n: number; kind: string; summary: string; createdAt: string; units: number; pages: number; bytes: number; lint: { errors: number; warnings: number } | null }[]; leadCount: number };
type Status = "live" | "draft" | "update" | "down" | "empty";
type Filter = "all" | "live" | "draft" | "update" | "archived";

export const RESUME_KEY = "keplar:create-site";

const statusOf = (x: Site): Status => (x.takenDown ? "down" : x.headVersion === 0 ? "empty" : x.publishedVersion === null ? "draft" : x.headVersion > x.publishedVersion ? "update" : "live");
const LABEL: Record<Status, string> = { live: "Live", draft: "Draft", update: "Needs update", down: "Taken down", empty: "Not built yet" };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `Request failed (${res.status})`));
  return data as T;
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function SiteProjects({ query, onResume }: { query: string; onResume: (id: string) => void }) {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [tpls, setTpls] = useState<MyTemplate[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ sites: Site[]; config?: { maxSites?: number } }>("/api/sites");
      setSites(r.sites);
      setMax(r.config?.maxSites ?? null);
      setErr(null);
    } catch (e) {
      setSites([]);
      setErr(e instanceof Error && /sign/i.test(e.message) ? null : e instanceof Error ? e.message : "Couldn't load your sites.");
    }
  }, []);
  const loadTemplates = useCallback(async () => {
    try { setTpls((await api<{ templates: MyTemplate[] }>("/api/templates")).templates); } catch { setTpls([]); } // signed out or not available: no template controls
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); void loadTemplates(); }, [load, loadTemplates]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = (sites ?? []).filter((x) => {
      if (q && !`${x.name} ${x.slug}`.toLowerCase().includes(q)) return false;
      const st = statusOf(x);
      if (filter === "archived") return Boolean(x.archived);
      if (x.archived) return false;
      return filter === "all" || (filter === "live" && st === "live") || (filter === "draft" && (st === "draft" || st === "empty")) || (filter === "update" && st === "update");
    });
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [sites, q, filter]);

  // Delete with undo (same dialog, window and server flow as the Create rail). The list is the source of truth, so it reloads after each step.
  const del = useSiteDelete({
    isActive: () => false,
    onRemoved: async (site) => { setSites((l) => (l ?? []).filter((x) => x.id !== site.id)); setOpen((o) => (o === site.id ? null : o)); setLive(`Deleted ${site.name}. Undo is available for a few seconds.`); await load(); },
    onRestored: async (site) => { setLive(`Restored ${site.name}.`); await load(); },
  });

  async function act(id: string, label: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setErr(null);
    try { await fn(); await load(); setLive(label); } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); } finally { setBusy(null); }
  }

  if (sites === null) return <p className={s.viewEmpty} role="status">Loading your sites…</p>;
  // Not signed in or nothing built yet: the chat projects above are the page. (After deleting the last site, keep the Undo toast.)
  if (!sites.length && !err) return del.toast || del.notice ? <SiteUndo toast={del.toast} notice={del.notice} onUndo={(id) => void del.undo(id)} /> : null;
  const counts = { all: sites.filter((x) => !x.archived).length, archived: sites.filter((x) => x.archived).length };

  return (
    <section className={css.section} aria-label="Sites">
      <div className={css.head}>
        <h2 className={css.h2}>Sites</h2>
        <span className={css.count}>{counts.all}{max ? ` of ${max}` : ""}</span>
        <SegmentedControl
          label="Filter sites"
          size="sm"
          className={css.filters}
          value={filter}
          onValueChange={setFilter}
          options={([["all", "All"], ["live", "Live"], ["draft", "Draft"], ["update", "Needs update"], ["archived", `Archived${counts.archived ? ` (${counts.archived})` : ""}`]] as [Filter, string][]).map(([value, label]) => ({ value, label }))}
        />
      </div>
      {err ? <p className={s.fieldError} role="alert">{err}</p> : null}
      <p className="visually-hidden" role="status" aria-live="polite">{live}</p>
      {shown.length === 0 ? <p className={s.viewEmpty}>{q || filter !== "all" ? "No sites match." : "No sites yet."}</p> : (
        <ul className={css.grid}>
          {shown.map((x) => {
            const st = statusOf(x);
            return (
              <li key={x.id} className={css.card} data-archived={x.archived || undefined} data-busy={busy === x.id || undefined}>
                <Thumb url={x.thumbUrl ?? null} name={x.name} />
                <div className={css.body}>
                  <div className={css.titleRow}>
                    {renaming === x.id ? (
                      <form className={css.rename} onSubmit={(e) => { e.preventDefault(); const n = draft.trim(); if (n) void act(x.id, `Renamed to ${n}.`, async () => { await api(`/api/sites/${x.id}`, { method: "PATCH", body: JSON.stringify({ name: n }) }); setRenaming(null); }); }}>
                        <label className="visually-hidden" htmlFor={`rn-${x.id}`}>Site name</label>
                        <input id={`rn-${x.id}`} className={s.textInput} value={draft} maxLength={60} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
                        <Button type="submit" size="sm" variant="primary">Save</Button>
                      </form>
                    ) : (
                      <h3 className={css.name} title={x.name}>{x.name}</h3>
                    )}
                    <span className={css.pill} data-status={st}>{LABEL[st]}</span>
                  </div>
                  <p className={css.meta}>
                    {x.headVersion ? `v${x.headVersion}` : "No version yet"}
                    {x.publishedVersion !== null ? ` · live v${x.publishedVersion}` : ""}
                    {x.leadCount ? ` · ${x.leadCount} message${x.leadCount === 1 ? "" : "s"}` : ""}
                    {` · ${ago(x.updatedAt)}`}
                    {x.archived ? " · archived" : ""}
                  </p>
                  <div className={css.actions}>
                    <Button size="sm" variant="secondary" onClick={() => onResume(x.id)}>Resume in Create</Button>
                    {x.publishedUrl && !x.takenDown ? <a className={la.act} data-variant="ghost" data-size="sm" href={x.publishedUrl} target="_blank" rel="noreferrer">Open live</a> : null}
                    <Button size="sm" variant="ghost" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? "Hide details" : "Details"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRenaming(x.id); setDraft(x.name); }}>Rename</Button>
                    <Tooltip content={max !== null && sites.length >= max ? "You're at your plan's site limit" : "Copy the latest version into a new draft"}>
                      <Button size="sm" variant="ghost" disabled={busy === x.id || (max !== null && sites.length >= max)} onClick={() => void act(x.id, `Duplicated ${x.name}.`, () => api(`/api/sites/${x.id}/duplicate`, { method: "POST", body: "{}" }))}>Duplicate</Button>
                    </Tooltip>
                    {x.headVersion && !x.takenDown && !x.archived ? <ShareTemplate siteId={x.id} siteName={x.name} existing={tpls.find((t) => t.sourceSiteId === x.id) ?? null} onChanged={() => { void loadTemplates(); setLive("Template settings updated."); }} /> : null}
                    <Tooltip content="Unpublish it first" disabled={x.archived || x.publishedVersion === null}>
                      <Button size="sm" variant="ghost" disabled={busy === x.id || (!x.archived && x.publishedVersion !== null)} onClick={() => void act(x.id, x.archived ? `Restored ${x.name}.` : `Archived ${x.name}.`, () => api(`/api/sites/${x.id}`, { method: "PATCH", body: JSON.stringify({ archived: !x.archived }) }))}>{x.archived ? "Restore" : "Archive"}</Button>
                    </Tooltip>
                    <Button size="sm" variant="ghost" className={css.danger} disabled={busy === x.id} aria-haspopup="dialog" aria-label={`Delete site: ${x.name}`} data-delete-site-for={x.id} onClick={() => del.ask({ id: x.id, name: x.name })}>Delete</Button>
                  </div>
                  {open === x.id ? <Drawer site={x} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DeleteSiteDialog target={del.target} busy={del.busy} error={del.error} onCancel={del.cancel} onConfirm={() => void del.confirm()} />
      <SiteUndo toast={del.toast} notice={del.notice} onUndo={(id) => void del.undo(id)} />
    </section>
  );
}

/** Thumbnail: a scaled, script-free, sandboxed render of the latest version; mounted only when scrolled near. */
function Thumb({ url, name }: { url: string | null; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!url || !ref.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [url]);
  return (
    <div ref={ref} className={css.thumb} aria-hidden={url ? undefined : "true"}>
      {url && on ? <iframe className={css.frame} src={url} title={`Preview of ${name}`} sandbox="" tabIndex={-1} loading="lazy" referrerPolicy="no-referrer" /> : <span className={css.blank}>{url ? "" : "Not built yet"}</span>}
    </div>
  );
}

function Drawer({ site }: { site: Site }) {
  const [a, setA] = useState<Act | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    api<Act>(`/api/sites/${site.id}/activity`).then((r) => on && setA(r)).catch((e) => on && setErr(e instanceof Error ? e.message : "Couldn't load activity."));
    return () => { on = false; };
  }, [site.id]);
  if (err) return <p className={s.fieldError} role="alert">{err}</p>;
  if (!a) return <p className={css.meta} role="status">Loading…</p>;
  return (
    <div className={css.drawer}>
      <div>
        <h4 className={css.h4}>Artifacts</h4>
        <ul className={css.art}>
          {site.publishedUrl && !site.takenDown ? <li><a href={site.publishedUrl} target="_blank" rel="noreferrer">{site.publishedUrl.replace(/^https?:\/\//, "")}</a><span>live site</span></li> : <li><span>Not published</span></li>}
          {site.headVersion ? <li><a href={`/api/sites/${site.id}/export`}>Download ZIP</a><span>{a.versions[0] ? `v${a.versions[0].n} · ${a.versions[0].pages} page${a.versions[0].pages === 1 ? "" : "s"} · ${Math.max(1, Math.round(a.versions[0].bytes / 1024))} KB` : ""}</span></li> : null}
          {a.leadCount ? <li><a href={`/api/sites/${site.id}/leads?format=csv`}>Messages as CSV</a><span>{a.leadCount} received</span></li> : null}
        </ul>
        <h4 className={css.h4}>Versions</h4>
        <ul className={css.vers}>
          {a.versions.slice(0, 6).map((v) => (
            <li key={v.n}><strong>v{v.n}</strong> <span>{v.summary || v.kind}</span><small>{when(v.createdAt)}{v.units ? ` · ${v.units} credits` : ""}{v.lint ? (v.lint.errors ? ` · ${v.lint.errors} issue${v.lint.errors === 1 ? "" : "s"} left` : " · checks passed") : ""}</small></li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className={css.h4}>Activity</h4>
        <ol className={css.tl}>
          {a.events.slice(0, 12).map((e, i) => (
            <li key={i} data-type={e.type}><span className={css.dot} aria-hidden="true" /><span><strong>{e.title}</strong>{e.detail ? <em>{e.detail}</em> : null}<small>{when(e.at)}</small></span></li>
          ))}
        </ol>
      </div>
    </div>
  );
}
