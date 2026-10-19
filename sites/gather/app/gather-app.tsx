"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, Compass, Copy, Download, Flower2, Loader2, LockKeyhole, MapPin, Pencil, Plus, Search, Ticket, Users, X } from "lucide-react";
import { categories, themes, type EventItem, type Viewer } from "@/lib/types";
import { sampleEvents } from "@/lib/samples";
import { calendar, csvCell, download } from "@/lib/downloads";

type Tab = "Discover" | "Going" | "Hosting";
type Guest = { name: string; email: string; createdAt: string };
type Draft = { title: string; description: string; category: string; venue: string; city: string; startsAt: string; endsAt: string; capacity: string; theme: string; hostName: string };
const date = (value: string, options: Intl.DateTimeFormatOptions = {}, timeZone?: string) => new Intl.DateTimeFormat("en-US", { ...options, ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
const localInput = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function initialDraft(user: Viewer): Draft {
  const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(18, 0, 0, 0);
  return { title: "", description: "", category: "Community", venue: "", city: "", startsAt: localInput(start.toISOString()), endsAt: localInput(new Date(+start + 7200000).toISOString()), capacity: "30", theme: "cobalt", hostName: user?.displayName.split("@")[0] || "" };
}
async function request<T = { id: string; ok: boolean }>(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Unable to load this right now. Try again.");
  return data;
}
function Poster({ event, mini = false }: { event: Pick<EventItem, "title" | "theme" | "category">; mini?: boolean }) {
  return <div className={`poster ${event.theme} ${mini ? "mini" : ""}`} aria-hidden="true">
    <div className="poster-top"><span>GATHER PRESENTS</span><Flower2 size={22} strokeWidth={1.6} /></div>
    <strong>{event.title}</strong><div className="poster-art"><i/><i/><i/><i/><i/></div>
    <div className="poster-bottom"><span>{event.category}</span><span>GOOD COMPANY. GOOD TIMES.</span></div>
  </div>;
}
function Dialog({ children, title, close, wide = false }: { children: ReactNode; title: string; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => { element?.close(); }; }, []);
  return <dialog ref={ref} className={wide ? "dialog wide" : "dialog"} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}>
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={21}/></button></div>{children}
  </dialog>;
}

export default function GatherApp({ user }: { user: Viewer }) {
  const [tab, setTab] = useState<Tab>("Discover"), [events, setEvents] = useState<EventItem[]>([]);
  const [samples, setSamples] = useState<EventItem[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(""), [category, setCategory] = useState("All events"), [city, setCity] = useState("Anywhere"), [period, setPeriod] = useState("Upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null), [creating, setCreating] = useState(false), [editing, setEditing] = useState<EventItem | null>(null);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [actionError, setActionError] = useState(""), [confirmCancel, setConfirmCancel] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]), [guestState, setGuestState] = useState(""), [showGuests, setShowGuests] = useState(false);
  const selected = [...events, ...samples].find(e => e.id === selectedId);
  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return []; }
    try { const data = await request<{ events: EventItem[] }>("/api/events"); setEvents(data.events); setLoadError(""); return data.events; }
    catch (error) { setLoadError((error as Error).message); return null; }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { setSamples(sampleEvents()); refresh(); const id = new URLSearchParams(location.search).get("event"); if (id) setSelectedId(id); }, [refresh]);
  useEffect(() => { const update = () => refresh(); window.addEventListener("focus", update); return () => window.removeEventListener("focus", update); }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { setActionError(""); setConfirmCancel(false); setShowGuests(false); setGuests([]); }, [selectedId]);
  const open = (event: EventItem) => { setSelectedId(event.id); const url = new URL(location.href); url.searchParams.set("event", event.id); history.replaceState(null, "", url); };
  const close = () => { setSelectedId(null); const url = new URL(location.href); url.searchParams.delete("event"); history.replaceState(null, "", url); };
  const create = () => { if (!user) { location.href = "/signin-with-chatgpt?return_to=/"; return; } setEditing(null); setCreating(true); };
  const changeTab = (next: Tab) => { setTab(next); setSearch(""); setCategory("All events"); setCity("Anywhere"); setPeriod("Upcoming"); };
  const published = events.filter(e => e.status === "published" && Date.parse(e.startsAt) > Date.now());
  const showingSamples = tab === "Discover" && published.length === 0;
  let collection = tab === "Hosting" ? events.filter(e => e.isHost) : tab === "Going" ? events.filter(e => e.isGoing) : showingSamples ? samples : published;
  collection = collection.filter(e => {
    if (category !== "All events" && e.category !== category) return false;
    if (city !== "Anywhere" && e.city !== city) return false;
    if (search && !`${e.title} ${e.city} ${e.venue} ${e.category} ${e.hostName}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (period === "Next 7 days" && (Date.parse(e.startsAt) > Date.now() + 7 * 86400000 || Date.parse(e.startsAt) < Date.now())) return false;
    if (period === "Past events" && Date.parse(e.endsAt) > Date.now()) return false;
    if (period === "Upcoming" && tab !== "Discover" && Date.parse(e.endsAt) < Date.now()) return false;
    return true;
  });
  const cities = Array.from(new Set([...events, ...(showingSamples ? samples : [])].map(e => e.city))).sort();
  async function act(method: string, suffix: string, payload?: unknown) {
    if (!selected) return;
    setBusy(true); setActionError("");
    try {
      await request(`/api/events/${selected.id}${suffix}`, method, payload);
      await refresh(); setConfirmCancel(false);
      setNotice(suffix === "/rsvp" ? method === "POST" ? "You’re on the list. See you there!" : "Your RSVP has been cancelled." : "Event cancelled. Guests will see the updated status.");
    } catch (error) { setActionError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setNotice("Event link copied. People need workspace access to open it."); }
    catch { setActionError("Copy the link from your browser’s address bar to share this event."); }
  }
  async function loadGuests() {
    if (!selected) return;
    setShowGuests(true); setGuestState("Loading guest list…");
    try { const data = await request<{ guests: Guest[] }>(`/api/events/${selected.id}/guests`); setGuests(data.guests); setGuestState(""); }
    catch (error) { setGuestState((error as Error).message); }
  }
  return <>
    <a className="skip-link" href="#main">Skip to events</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="Gather home"><Flower2 aria-hidden="true" strokeWidth={2.4}/><span>gather<span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Main navigation">{([{ label: "Discover", icon: Compass }, { label: "Going", icon: Ticket }, { label: "Hosting", icon: CalendarDays }] as const).map(({ label, icon: Icon }) => <button key={label} className={tab === label ? "nav-item active" : "nav-item"} aria-current={tab === label ? "page" : undefined} onClick={() => changeTab(label)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="header-actions"><button className="button primary" onClick={create}><Plus size={18}/><span>Create event</span></button>{user ? <span className="avatar" title={user.email} aria-label={`Signed in as ${user.displayName}`}>{user.displayName.slice(0, 1).toUpperCase()}</span> : <a className="sign-in" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in</a>}</div>
    </div></header>
    <main id="main" className="main-shell">
      {tab === "Discover" ? <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><span className="eyebrow"><span className="little-spark">✳</span> A LITTLE MORE TOGETHER</span><h1 id="hero-title">Good things happen<br/>when we <span>gather.</span></h1><p>Find your people. Make a plan.<br className="mobile-break"/> Turn “we should” into “see you there.”</p><button className="text-link" onClick={create}>Host something of your own <ArrowRight size={18}/></button></div><div className="hero-art" aria-hidden="true"><div className="art-ticket art-ticket-back"><span>YOU’RE<br/>INVITED.</span><Flower2 size={62}/></div><div className="art-ticket art-ticket-front"><span className="tiny">MAKE ROOM FOR</span><strong>good<br/>company.</strong><div className="ticket-flower">✳</div><div className="ticket-stub"><span>ONE GOOD TIME</span><span>ADMIT EVERYONE</span></div></div><span className="art-note">Life’s better in good company.</span></div></section>
      : <section className="page-intro"><span className="eyebrow">{tab === "Going" ? "MAKE A LITTLE ROOM FOR FUN" : "BRING YOUR PEOPLE TOGETHER"}</span><h1>{tab === "Going" ? "You’ve got plans." : "Make it happen."}</h1><p>{tab === "Going" ? "All the events you’re looking forward to, in one place." : "Your events, your guests, and everything you need to host."}</p></section>}
      {tab === "Hosting" && <div className="host-summary"><div><CalendarDays/><strong>{events.filter(e => e.isHost && e.status === "published" && Date.parse(e.endsAt) > Date.now()).length}</strong><span>Upcoming events</span></div><div><Users/><strong>{events.filter(e => e.isHost).reduce((n, e) => n + e.attending, 0)}</strong><span>Total registrations</span></div><div className="host-summary-note"><Flower2/><span>A great gathering starts<br/>with a simple invitation.</span></div></div>}
      <section className="event-section" aria-labelledby="events-heading">
        <div className="section-heading"><div><h2 id="events-heading">{tab === "Discover" ? "Find your next good thing" : tab === "Going" ? "Your events" : "Events you’re hosting"}</h2><p>{tab === "Discover" ? showingSamples ? "A little inspiration for what you could bring to life." : "Small gatherings. Shared interests. Real connections." : "Good company is on the calendar."}</p></div><div className="select-wrap period"><CalendarDays size={16}/><select aria-label="Filter by date" value={period} onChange={e => setPeriod(e.target.value)}><option>Upcoming</option><option>Next 7 days</option>{tab !== "Discover" && <option>Past events</option>}{tab !== "Discover" && <option>All dates</option>}</select><ChevronDown size={14}/></div></div>
        <div className="search-row"><div className="search-box"><Search size={20}/><input type="search" aria-label="Search events" placeholder="Search events, places, or people" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button className="icon-button" onClick={() => setSearch("")} aria-label="Clear search"><X size={17}/></button>}</div><div className="select-wrap city"><MapPin size={18}/><select aria-label="Filter by city" value={city} onChange={e => setCity(e.target.value)}><option>Anywhere</option>{cities.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={15}/></div></div>
        <div className="category-row" role="group" aria-label="Event categories">{["All events", ...categories].map((c, i) => <button key={c} className={category === c ? "category active" : "category"} aria-pressed={category === c} onClick={() => setCategory(c)}>{i === 0 && <Compass size={16}/>} {c}</button>)}</div>
        {loadError ? <div className="empty-state" role="alert"><h3>Events couldn’t load</h3><p>{loadError}</p><button className="button secondary" onClick={() => { setLoading(true); refresh(); }}>Try again</button></div>
        : loading ? <div className="loading-state" role="status"><Loader2 className="spinner"/>Loading events…</div>
        : <>{showingSamples && <div className="sample-note"><span>THE INSPIRATION BOARD</span><p>These are sample events. <button onClick={create}>Create the first real one <ArrowUpRight size={14}/></button></p></div>}
        <div className="events-grid">{collection.map(event => <article className="event-card" key={event.id}><button className="event-open" onClick={() => open(event)} aria-label={`View ${event.title}`}><div className="cover-wrap"><Poster event={event}/><span className="cover-badge">{event.sample ? "Sample event" : event.status === "cancelled" ? "Cancelled" : event.isGoing ? "✓ You’re going" : "Free"}</span><span className="cover-arrow"><ArrowUpRight size={20}/></span></div><div className="card-content"><div className="event-date">{date(event.startsAt, { weekday: "short", month: "short", day: "numeric" }, event.timezone)} <span>·</span> {date(event.startsAt, { hour: "numeric", minute: "2-digit" }, event.timezone)}</div><h3>{event.title}</h3><p className="event-place"><MapPin size={14}/><span>{event.venue} · {event.city}</span></p><div className="card-footer"><span className={`host-avatar ${event.theme}`}>{event.hostName.slice(0, 1)}</span><span>{event.hostName}</span>{!event.sample && <span className="attending"><Users size={14}/>{event.attending}/{event.capacity}</span>}</div></div></button></article>)}</div>
        {!collection.length && <div className="empty-state"><div className="empty-icon">{tab === "Going" ? <Ticket/> : <CalendarDays/>}</div><h3>{search || category !== "All events" || city !== "Anywhere" ? "No events match just yet" : tab === "Going" ? "Your next good time is out there" : "The best plans start with you"}</h3><p>{search || category !== "All events" || city !== "Anywhere" ? "Try another search or clear your filters." : tab === "Going" ? "Explore events and RSVP to keep all your plans here." : "A dinner, a workshop, a big idea. What will you bring to life?"}</p><button className="button primary" onClick={() => { if (search || category !== "All events" || city !== "Anywhere") { setSearch(""); setCategory("All events"); setCity("Anywhere"); setPeriod("All dates"); } else if (tab === "Going") changeTab("Discover"); else create(); }}>{search || category !== "All events" || city !== "Anywhere" ? "Clear filters" : tab === "Going" ? "Discover events" : "Create your first event"}<ArrowRight size={17}/></button></div>}</>}
      </section>
      {tab === "Discover" && <section className="host-banner"><div className="banner-mark"><Flower2 size={42}/></div><div><h2>Have a reason to get together?</h2><p>That’s all you need. Put a date on it.</p></div><button className="button primary" onClick={create}>Create an event <ArrowUpRight size={18}/></button></section>}
      <footer className="footer"><span className="footer-brand">gather.</span><span>Less scrolling. More showing up.</span><span className="private-label"><LockKeyhole size={13}/>Private workspace</span></footer>
    </main>
    {notice && <div role="status" className="toast"><Check size={18}/><span>{notice}</span><button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={17}/></button></div>}
    {selectedId && !selected && !loading && <Dialog title="Event unavailable" close={close}><div className="dialog-body"><p>This event couldn’t be found. Check the link or discover another gathering.</p><button className="button primary" onClick={close}>Browse events</button></div></Dialog>}
    {selected && !creating && <Dialog title={selected.sample ? "A little inspiration" : "Event details"} close={close} wide><div className="detail-grid"><div className="detail-main"><Poster event={selected}/><div className="detail-tags"><span className="tag">{selected.category}</span><span className="tag">{selected.sample ? "Sample event" : selected.status === "cancelled" ? "Cancelled" : "Free admission"}</span></div><h2 className="detail-title">{selected.title}</h2><p className="detail-host">Hosted by <strong>{selected.hostName}</strong></p><h3>About this gathering</h3><p className="description">{selected.description}</p></div><aside className="detail-aside"><div className="detail-info"><CalendarDays/><div><strong>{date(selected.startsAt, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, selected.timezone)}</strong><span>{date(selected.startsAt, { hour: "numeric", minute: "2-digit" }, selected.timezone)} – {date(selected.endsAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, selected.timezone)}</span><small>{selected.timezone.replace(/_/g, " ")}</small></div></div><div className="detail-info"><MapPin/><div><strong>{selected.venue}</strong><span>{selected.city}</span></div></div><div className="detail-info"><Users/><div><strong>{selected.sample ? `${selected.capacity} guest capacity` : `${selected.attending} going · ${Math.max(0, selected.capacity - selected.attending)} spots left`}</strong><span>Good company starts here.</span></div></div>
      {selected.sample ? <div className="registration"><h3>Make this idea yours.</h3><p>This is an example, ready to inspire your own event.</p><button className="button primary full" onClick={() => { setSelectedId(null); create(); }}>Create an event <Plus size={17}/></button></div>
      : selected.isHost ? <div className="registration"><h3>You’re the host.</h3><p>A little planning. A lot to look forward to.</p>{selected.status !== "cancelled" && <button className="button primary full" onClick={() => { setEditing(selected); setCreating(true); }}><Pencil size={16}/>Edit event</button>}<button className="button secondary full" onClick={loadGuests}><Users size={17}/>Manage guests</button><button className="button secondary full" onClick={copyLink}><Copy size={16}/>Copy event link</button>{selected.status !== "cancelled" && !confirmCancel && <button className="danger-link" onClick={() => setConfirmCancel(true)}>Cancel event</button>}{confirmCancel && <div className="cancel-confirm"><p>Cancel this event for all guests? This can’t be undone. Guests will see its cancelled status; no email is sent.</p><button className="button danger full" disabled={busy} onClick={() => act("PATCH", "", { status: "cancelled" })}>{busy ? "Cancelling…" : "Yes, cancel event"}</button><button className="button secondary full" onClick={() => setConfirmCancel(false)}>Keep event</button></div>}</div>
      : <div className="registration"><h3>{selected.status === "cancelled" ? "This event was cancelled" : selected.isGoing ? "You’re on the list!" : "Come along."}</h3><p>{selected.isGoing ? "Your spot is saved. Add it to your calendar." : "Free to join. Good company included."}</p>{selected.isGoing ? <><button className="button primary full" onClick={() => calendar(selected)} disabled={selected.status === "cancelled"}><CalendarDays size={17}/>Add to calendar</button><button className="button secondary full" onClick={() => act("DELETE", "/rsvp")} disabled={busy}>{busy ? "Cancelling…" : "Cancel RSVP"}</button></> : <button className="button primary full" onClick={() => { if (!user) { location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent("/?event=" + selected.id)}`; return; } act("POST", "/rsvp"); }} disabled={busy || selected.status === "cancelled" || selected.attending >= selected.capacity || Date.parse(selected.startsAt) <= Date.now()}>{busy ? <><Loader2 className="spinner" size={17}/>Saving your spot…</> : selected.status === "cancelled" ? "Registration closed" : Date.parse(selected.startsAt) <= Date.now() ? "Registration closed" : selected.attending >= selected.capacity ? "Event full" : <>RSVP · Join the gathering<ArrowRight size={17}/></>}</button>}<button className="button secondary full" onClick={copyLink}><Copy size={16}/>Copy event link</button></div>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}<p className="privacy-note"><LockKeyhole size={13}/>Event links are available to people with workspace access.</p></aside></div>
      {showGuests && <section className="guests-panel"><div className="section-heading"><h3>Guest list ({guests.length})</h3><button className="button secondary" disabled={!guests.length || Boolean(guestState)} onClick={() => download("gather-guests.csv", "Name,Email,Registered at\r\n" + guests.map(g => [g.name, g.email, g.createdAt].map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8")}><Download size={16}/>Export CSV</button></div>{guestState ? <p role="status">{guestState}</p> : !guests.length ? <p>No RSVPs yet. Share the event link with people who have workspace access.</p> : <ul className="guest-list">{guests.map(g => <li key={g.email}><span className="avatar">{g.name[0].toUpperCase()}</span><div><strong>{g.name}</strong><span>{g.email}</span></div><span className="tag">Going</span></li>)}</ul>}</section>}
    </Dialog>}
    {creating && <EventForm user={user} event={editing} close={() => setCreating(false)} saved={async id => { setCreating(false); await refresh(); setTab("Hosting"); setSelectedId(id); setNotice(editing ? "Changes saved. Your event is up to date." : "Your event is ready. Time to bring people together."); }} />}
  </>;
}

function EventForm({ user, event, close, saved }: { user: Viewer; event: EventItem | null; close: () => void; saved: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => event ? { ...event, capacity: String(event.capacity), startsAt: localInput(event.startsAt), endsAt: localInput(event.endsAt) } : initialDraft(user));
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const key = `gather-event-draft-${user?.email || "guest"}`;
  useEffect(() => { if (!event) { try { const stored = localStorage.getItem(key); if (stored) setDraft(d => ({ ...d, ...JSON.parse(stored) })); } catch {} } setReady(true); }, [event, key]);
  useEffect(() => { if (ready && !event) { try { localStorage.setItem(key, JSON.stringify(draft)); } catch {} } }, [draft, ready, event, key]);
  const field = (name: keyof Draft) => ({ value: draft[name], onChange: (e: { target: { value: string } }) => setDraft(d => ({ ...d, [name]: e.target.value })) });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { ...draft, startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(), capacity: Number(draft.capacity), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const result = await request(event ? `/api/events/${event.id}` : "/api/events", event ? "PATCH" : "POST", payload);
      if (!event) { try { localStorage.removeItem(key); } catch {} }
      saved(event?.id || result.id);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog title={event ? "Edit your event" : "Bring something good to life."} close={close} wide><form className="event-form" onSubmit={submit}><div className="form-main"><p className="form-intro">{event ? "Keep your guests in the loop with up-to-date details." : "A few details, a simple invitation, and you’re on your way."}</p><label>Event name<input required minLength={3} maxLength={100} placeholder="Give your gathering a name" {...field("title")} autoFocus/></label><div className="form-row"><label>Category<select {...field("category")}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Hosted by<input required minLength={2} maxLength={80} {...field("hostName")} autoComplete="name"/></label></div><fieldset><legend>When’s it happening?</legend><div className="form-row"><label>Starts<input type="datetime-local" required {...field("startsAt")}/></label><label>Ends<input type="datetime-local" required {...field("endsAt")}/></label></div><p className="field-hint"><Clock3 size={13}/>Times in {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}</p></fieldset><div className="form-row"><label>Venue or meeting link<input required minLength={2} maxLength={200} placeholder="A place to come together" {...field("venue")}/></label><label>City<input required minLength={2} maxLength={100} placeholder="e.g. Brooklyn or Online" {...field("city")}/></label></div><label>About your event<textarea required minLength={10} maxLength={4000} rows={5} placeholder="What’s the plan? Tell people what to expect, what to bring, and what makes it worth showing up for." {...field("description")}/></label><div className="form-row"><label>Guest capacity<input required type="number" min={Math.max(1, event?.attending || 1)} max={10000} step={1} {...field("capacity")}/></label><div className="free-ticket"><Ticket size={20}/><div><strong>Free admission</strong><span>One RSVP per person</span></div></div></div>{error && <p className="form-error" role="alert">{error}</p>}</div><aside className="form-aside"><span className="eyebrow">YOUR EVENT COVER</span><Poster event={{ title: draft.title || "Your next good thing", category: draft.category, theme: draft.theme }}/><fieldset className="theme-picker"><legend>Pick your color</legend><div>{themes.map(t => <button type="button" key={t} className={`theme-swatch ${t}`} aria-label={`${t} cover`} aria-pressed={draft.theme === t} onClick={() => setDraft(d => ({ ...d, theme: t }))}>{draft.theme === t && <Check size={20}/>}</button>)}</div></fieldset><div className="form-tip"><Flower2 size={24}/><p>It doesn’t need to be a big occasion. Just a good reason to get together.</p></div><p className="privacy-note"><LockKeyhole size={14}/>People with workspace access can view this event. Your guest list is only visible to you.</p></aside><div className="form-actions"><span>{event ? "Changes appear on the event page." : "Draft saved on this device as you type."}</span><button type="button" className="button secondary" onClick={close} disabled={busy}>Save for later</button><button className="button primary" disabled={busy}>{busy ? <><Loader2 className="spinner" size={17}/>Saving…</> : <>{event ? "Save changes" : "Create event"}<ArrowRight size={17}/></>}</button></div></form></Dialog>;
}
