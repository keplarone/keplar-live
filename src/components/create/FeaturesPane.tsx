"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import s from "./create.module.css";
import b from "./builder.module.css";
import f from "./features.module.css";

type Cat = { id: string; label: string; status: "live" | "beta" | "soon"; summary: string; note: string | null; prompt: string; addable: boolean; placed: number };
type View = {
  payments: { ready: boolean; reason: string | null; mode: "test" | "live"; orders: { id: string; product: string; amount: number; currency: string; status: string; email: string | null; at: string }[] };
  catalog: Cat[];
  settings: { notifyOwner: boolean; confirmVisitors: boolean; analytics: boolean; emailDelivery: boolean };
  leads: number;
  subscribers: { id: string; table: string; email: string; name: string; kind: string; at: string }[];
  members: { id: string; email: string; at: string }[];
  bookings: { id: string; table: string; name: string; email: string; note: string; start: string; tz: string; status: string }[];
};
type Post = { id: string; title: string; slug: string; body: string; status: "draft" | "published"; publishedAt: string | null };
type Blog = { key: string; title: string; posts: Post[] };
type Table = { key: string; title: string; columns: string[]; rows: ({ id: string } & Record<string, string>)[]; publicUrl: string | null };

const CHIP = { live: "LIVE", beta: "BETA", soon: "COMING SOON" } as const;
const when = (iso: string, tz: string) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + ` (${tz})`; } catch { return iso; } };

/** Add-feature panel: what the builder can embed (with honest status), what is on this site, what visitors sent, and the email choices. */
export function FeaturesPane({ siteId, version, disabled, onAdd }: { siteId: string; version: number; disabled: boolean; onAdd: (prompt: string) => void }) {
  const [v, setV] = useState<View | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [a, d, bl] = await Promise.all([api<View>(`/api/sites/${siteId}/features`), api<{ tables: Table[] }>(`/api/sites/${siteId}/data`), api<{ blogs: Blog[] }>(`/api/sites/${siteId}/blog`)]);
        if (live) { setV(a); setTables(d.tables); setBlogs(bl.blogs); setErr(null); }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : "Couldn't load features.");
      }
    })();
    return () => { live = false; };
  }, [siteId, version, tick]);
  const load = async () => setTick((n) => n + 1);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); } };
  if (err && !v) return <div className={b.pane}><p role="alert" className={s.muted}>{err}</p><button type="button" className={s.btn} onClick={() => void load()}>Try again</button></div>;
  if (!v) return <div className={b.pane}><p className={s.muted} role="status">Loading features…</p></div>;
  const setting = (k: "notifyOwner" | "confirmVisitors" | "analytics", on: boolean) => act(() => api(`/api/sites/${siteId}`, { method: "PATCH", body: JSON.stringify({ featureSettings: { [k]: on } }) }));
  return (
    <div className={`${b.pane} ${f.touch}`} data-testid="features-pane">
      {err ? <p role="alert" className={s.muted}>{err}</p> : null}
      <section className={b.card} aria-label="Add a feature">
        <strong>Add a feature</strong>
        <p className={b.hint}>These are real and run on the published site. Click one and the builder places it on the right page. Nothing here is a mock-up: anything not built is marked COMING SOON and can&apos;t be added.</p>
        <ul className={b.list}>
          {v.catalog.map((f) => (
            <li key={f.id} className={b.item} data-testid={`feature-${f.id}`}>
              <div className={b.itemMain}>
                <strong>{f.label} <span className={`${b.chip} ${b.chipStatic}`}>{CHIP[f.status]}</span>{f.placed ? <span className={`${b.chip} ${b.chipStatic}`} style={{ marginLeft: 6 }}>On this site ×{f.placed}</span> : null}</strong>
                <small>{f.summary}{f.note ? ` ${f.note}` : ""}</small>
              </div>
              {f.status === "soon" || !f.addable ? null : <button type="button" className={s.iconBtn} disabled={disabled} onClick={() => onAdd(f.prompt)}>{f.placed ? "Add another" : "Add"}</button>}
            </li>
          ))}
        </ul>
      </section>
      <AnalyticsCard siteId={siteId} version={version} tick={tick} counting={v.settings.analytics} onToggle={(on) => void setting("analytics", on)} />
      <section className={b.card} aria-label="Email choices">
        <strong>Email choices</strong>
        <p className={b.hint}>Off by default. Nothing is emailed to you or to your visitors until you turn it on.{v.settings.emailDelivery ? "" : " Email delivery isn’t set up on this server yet, so these switches have no effect for now."}</p>
        <label className={b.row}><input type="checkbox" checked={v.settings.notifyOwner} onChange={(e) => void setting("notifyOwner", e.target.checked)} /> <span>Email me when someone sends a form, signs up or books</span></label>
        <label className={b.row}><input type="checkbox" checked={v.settings.confirmVisitors} onChange={(e) => void setting("confirmVisitors", e.target.checked)} /> <span>Email visitors a confirmation when they book</span></label>
      </section>
      {v.catalog.some((f) => f.id === "checkout" && f.placed) ? (
        <section className={b.card} aria-label="Payments" data-testid="payments-card">
          <strong>Payments <span className={`${b.chip} ${b.chipStatic}`}>BETA</span></strong>
          <p className={b.hint}>{v.payments.ready ? `Ready. Stripe ${v.payments.mode} mode${v.payments.mode === "test" ? ": no real money moves." : "."} Orders are confirmed by Stripe, then appear here and in Business > Orders.` : `Buy buttons are shown as "Not available yet" to visitors. ${v.payments.reason ?? ""}`}</p>
          {v.payments.orders.length ? (
            <ul className={b.list}>{v.payments.orders.map((o) => (
              <li key={o.id} className={b.item}><div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{o.product}</strong><small>{(o.amount / 100).toFixed(2)} {o.currency.toUpperCase()} · {o.status}{o.email ? ` · ${o.email}` : ""}</small></div></li>
            ))}</ul>
          ) : <p className={b.hint}>No orders yet.</p>}
        </section>
      ) : null}
      {v.subscribers.length ? (
        <section className={b.card} aria-label="Signups" data-testid="signups">
          <strong>Signups ({v.subscribers.length})</strong>
          <ul className={b.list}>{v.subscribers.map((x) => (
            <li key={x.id} className={b.item}><div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{x.email}</strong><small>{x.kind}{x.name ? ` · ${x.name}` : ""}</small></div><button type="button" className={s.iconBtn} onClick={() => void act(() => api(`/api/sites/${siteId}/features`, { method: "DELETE", body: JSON.stringify({ id: x.id }) }))}>Remove</button></li>
          ))}</ul>
          <p className={b.hint}>Each signup is also a contact in Business.</p>
        </section>
      ) : null}
      {v.members.length ? (
        <section className={b.card} aria-label="Members" data-testid="members">
          <strong>Members ({v.members.length}) <span className={`${b.chip} ${b.chipStatic}`}>BETA</span></strong>
          <ul className={b.list}>{v.members.map((x) => (
            <li key={x.id} className={b.item}><div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{x.email}</strong><small>Joined {new Date(x.at).toLocaleDateString()}</small></div><button type="button" className={s.iconBtn} onClick={() => void act(() => api(`/api/sites/${siteId}/features`, { method: "DELETE", body: JSON.stringify({ id: x.id }) }))}>Remove</button></li>
          ))}</ul>
          <p className={b.hint}>Removing a member signs them out right away. Passwords are never shown or stored in plain text.</p>
        </section>
      ) : null}
      {v.bookings.length ? (
        <section className={b.card} aria-label="Bookings" data-testid="bookings">
          <strong>Bookings ({v.bookings.length})</strong>
          <ul className={b.list}>{v.bookings.map((x) => (
            <li key={x.id} className={b.item}><div className={b.itemMain}><strong>{when(x.start, x.tz)}</strong><small style={{ overflowWrap: "anywhere" }}>{x.name} · {x.email}{x.note ? ` · ${x.note}` : ""}</small></div><button type="button" className={s.iconBtn} onClick={() => void act(() => api(`/api/sites/${siteId}/features`, { method: "DELETE", body: JSON.stringify({ id: x.id }) }))}>Cancel booking</button></li>
          ))}</ul>
        </section>
      ) : null}
      {blogs.map((bl) => <BlogEditor key={bl.key} siteId={siteId} blog={bl} act={act} />)}
      {tables.map((t) => <TableEditor key={t.key} siteId={siteId} t={t} act={act} />)}
      <p className={b.hint}>Form messages are in the Leads tab ({v.leads} so far). Visitors who leave an email also appear as contacts in Business.</p>
    </div>
  );
}

function TableEditor({ siteId, t, act }: { siteId: string; t: Table; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, Record<string, string>>>({});
  const send = (method: string, payload: unknown) => act(() => api(`/api/sites/${siteId}/data`, { method, body: JSON.stringify(payload) }));
  const label = (c: string) => c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
  return (
    <section className={b.card} aria-label={`Table ${t.title}`} data-testid={`table-${t.key}`}>
      <strong>{t.title} <span className={`${b.chip} ${b.chipStatic}`}>{t.rows.length} rows</span></strong>
      <p className={b.hint}>Shown on your site. {t.publicUrl ? <>Anyone can read it as JSON at <code>{t.publicUrl}</code>; only you can change it.</> : "Once published, anyone can read it as JSON; only you can change it."}</p>
      <ul className={b.list}>
        {t.rows.map((r) => {
          const cur = edit[r.id] ?? r;
          const dirty = edit[r.id] !== undefined;
          return (
            <li key={r.id} className={b.item} style={{ alignItems: "flex-end" }}>
              {t.columns.map((c) => <label key={c} className={b.field} style={{ flex: "1 1 8rem" }}><span>{label(c)}</span><input className={s.input} value={cur[c] ?? ""} maxLength={500} onChange={(e) => setEdit({ ...edit, [r.id]: { ...cur, [c]: e.target.value } })} /></label>)}
              {dirty ? <button type="button" className={s.btn} onClick={() => void send("PATCH", { table: t.key, id: r.id, row: cur }).then(() => setEdit((p) => { const n = { ...p }; delete n[r.id]; return n; }))}>Save</button> : null}
              <button type="button" className={s.iconBtn} onClick={() => void send("DELETE", { table: t.key, id: r.id })}>Delete</button>
            </li>
          );
        })}
      </ul>
      <div className={b.row} style={{ alignItems: "flex-end" }}>
        {t.columns.map((c) => <label key={c} className={b.field} style={{ flex: "1 1 8rem" }}><span>{label(c)}</span><input className={s.input} value={draft[c] ?? ""} maxLength={500} onChange={(e) => setDraft({ ...draft, [c]: e.target.value })} /></label>)}
        <button type="button" className={s.btn} disabled={!Object.values(draft).some((x) => x.trim())} onClick={() => void send("POST", { table: t.key, row: draft }).then(() => setDraft({}))}>Add row</button>
      </div>
    </section>
  );
}

function BlogEditor({ siteId, blog, act }: { siteId: string; blog: Blog; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const call = (method: string, payload: object) => act(() => api(`/api/sites/${siteId}/blog`, { method, body: JSON.stringify({ key: blog.key, ...payload }) }));
  return (
    <section className={b.card} aria-label={`Blog: ${blog.title}`} data-testid={`blog-${blog.key}`}>
      <strong>{blog.title} <span className={`${b.chip} ${b.chipStatic}`}>{blog.posts.length} post{blog.posts.length === 1 ? "" : "s"}</span></strong>
      <p className={b.hint}>Write plain text. A line starting with ## is a heading, lines starting with - are a list, a blank line starts a new paragraph. Changes are live as soon as you save a published post.</p>
      <ul className={b.list}>
        {blog.posts.map((p) => (
          <li key={p.id} className={b.item} style={{ display: "grid" }}>
            {editing === p.id ? (
              <>
                <input value={draft.title} maxLength={140} aria-label="Post title" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <textarea value={draft.body} rows={8} maxLength={20000} aria-label="Post text" onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className={b.row}>
                  <button type="button" className={s.btn} onClick={() => void call("PATCH", { id: p.id, ...draft }).then(() => setEditing(null))}>Save</button>
                  <button type="button" className={s.iconBtn} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{p.title}</strong><small>{p.status === "published" ? "Published" : "Draft (not on the site)"} · /{p.slug}</small></div>
                <div className={b.row}>
                  <button type="button" className={s.iconBtn} onClick={() => { setEditing(p.id); setDraft({ title: p.title, body: p.body }); }}>Edit</button>
                  <button type="button" className={s.iconBtn} onClick={() => void call("PATCH", { id: p.id, status: p.status === "published" ? "draft" : "published" })}>{p.status === "published" ? "Unpublish" : "Publish"}</button>
                  <button type="button" className={s.iconBtn} onClick={() => void call("DELETE", { id: p.id })}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={b.itemMain} style={{ display: "grid", gap: 8 }}>
        <input value={title} maxLength={140} placeholder="New post title" aria-label="New post title" onChange={(e) => setTitle(e.target.value)} />
        <textarea value={text} rows={5} maxLength={20000} placeholder="Write something…" aria-label="New post text" onChange={(e) => setText(e.target.value)} />
        <div className={b.row}>
          <button type="button" className={s.btn} disabled={!title.trim()} onClick={() => void call("POST", { title, body: text, publish: true }).then(() => { setTitle(""); setText(""); })}>Publish post</button>
          <button type="button" className={s.iconBtn} disabled={!title.trim()} onClick={() => void call("POST", { title, body: text, publish: false }).then(() => { setTitle(""); setText(""); })}>Save as draft</button>
        </div>
      </div>
    </section>
  );
}

type Stats = { days: number; views: number; visitors: number; series: { day: string; views: number; visitors: number }[]; pages: { path: string; views: number }[]; referrers: { host: string; views: number }[]; cappedDays: string[]; published: boolean };
function AnalyticsCard({ siteId, version, tick, counting, onToggle }: { siteId: string; version: number; tick: number; counting: boolean; onToggle: (on: boolean) => void }) {
  const [st, setSt] = useState<Stats | null>(null);
  useEffect(() => {
    let live = true;
    api<Stats>(`/api/sites/${siteId}/analytics?days=30`).then((d) => live && setSt(d)).catch(() => undefined);
    return () => { live = false; };
  }, [siteId, version, tick]);
  const max = Math.max(1, ...(st?.series.map((d) => d.views) ?? [1]));
  return (
    <section className={b.card} aria-label="Visits" data-testid="analytics-card">
      <strong>Visits, last 30 days <span className={`${b.chip} ${b.chipStatic}`}>LIVE</span></strong>
      {!st ? <p className={b.hint}>Loading…</p> : (
        <>
          <p data-testid="analytics-totals"><strong>{st.views}</strong> page view{st.views === 1 ? "" : "s"} · <strong>{st.visitors}</strong> daily visitor{st.visitors === 1 ? "" : "s"} (a person on two days counts twice)</p>
          {!st.published ? <p className={b.hint}>Nothing is counted until you publish the site.</p> : null}
          {st.cappedDays.length ? <p className={b.hint}>{st.cappedDays.length} busy day{st.cappedDays.length === 1 ? "" : "s"} hit the daily counting limit, so those days show at least that many.</p> : null}
          <div role="img" aria-label={`Views per day, highest ${max}`} style={{ display: "flex", alignItems: "end", gap: 2, height: 56 }}>
            {st.series.map((d) => <span key={d.day} title={`${d.day}: ${d.views}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (d.views / max) * 100)}%`, background: "currentColor", opacity: d.views ? 0.7 : 0.15, borderRadius: 2 }} />)}
          </div>
          {st.pages.length ? <><small>Top pages</small><ul className={b.list}>{st.pages.slice(0, 5).map((p) => <li key={p.path} className={b.item}><div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{p.path}</strong></div><small>{p.views}</small></li>)}</ul></> : null}
          {st.referrers.length ? <><small>Where visitors came from</small><ul className={b.list}>{st.referrers.slice(0, 5).map((p) => <li key={p.host} className={b.item}><div className={b.itemMain}><strong style={{ overflowWrap: "anywhere" }}>{p.host}</strong></div><small>{p.views}</small></li>)}</ul></> : null}
        </>
      )}
      <label className={b.row}><input type="checkbox" checked={counting} onChange={(e) => onToggle(e.target.checked)} /> <span>Count visits to this site</span></label>
      <p className={b.hint}>No cookies and no scripts. We never store IP addresses: a visitor is a daily code that can’t be linked across days. Bots, previews, and visitors who send Do Not Track are not counted.</p>
    </section>
  );
}
