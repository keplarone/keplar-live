"use client";
/**
 * Settings for answer preferences ("Personalization"), saved Specialists, Family mode, and every shared link (answers, chats, specialists) with revoke.
 * All of it is the signed-in person's own data in their personal workspace; exported and deleted with the account.
 */
import { useEffect, useState } from "react";
import { confirmAction, Switch } from "@/components/kit";
import s from "./account.module.css";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Something went wrong.");
  return j;
}

const area: React.CSSProperties = { minHeight: 110, padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-sm)", border: "1px solid var(--hairline-strong)", background: "var(--c-canvas)", color: "var(--c-ink)", font: "inherit", resize: "vertical" };
const list: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 };
const item: React.CSSProperties = { alignItems: "center", borderTop: "1px solid var(--hairline)", paddingTop: "var(--s-2)" };
const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

type Prefs = { enabled: boolean; aboutYou: string; howToAnswer: string; style: string; customStyle: string; location?: string; updatedAt?: string };
type Style = { id: string; label: string; hint: string };

export function PersonalizationSettings() {
  const [p, setP] = useState<Prefs | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  const [plan, setPlan] = useState("free");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    api<{ prefs: Prefs; styles: Style[]; plan: string }>("/api/preferences").then((r) => { if (on) { setP(r.prefs); setStyles(r.styles); setPlan(r.plan); } }).catch((e: Error) => on && setError(e.message));
    return () => { on = false; };
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p) return;
    setBusy(true); setError(""); setNote("");
    try { const r = await api<{ prefs: Prefs }>("/api/preferences", { method: "PUT", body: JSON.stringify({ enabled: p.enabled, aboutYou: p.aboutYou, howToAnswer: p.howToAnswer, style: p.style, customStyle: p.customStyle, location: p.location ?? "" }) }); setP(r.prefs); setNote("Saved. Used from your next message."); }
    catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!(await confirmAction({ title: "Clear all your answer preferences?", body: "About you, how to answer and your style go back to empty. This can’t be undone.", confirmLabel: "Clear preferences", danger: true }))) return;
    setError(""); setNote("");
    try { await api("/api/preferences", { method: "DELETE" }); setP({ enabled: true, aboutYou: "", howToAnswer: "", style: "standard", customStyle: "", location: "" }); setNote("Cleared."); } catch (er) { setError((er as Error).message); }
  };
  const hint = styles.find((x) => x.id === p?.style)?.hint;
  return (
    <div className={s.panel} id="personalization" aria-labelledby="pers-h">
      <div className={s.prefRow}>
        <h2 id="pers-h" className={s.cardTitle}>Answer preferences</h2>
        <Switch className={s.kSwitch} checked={p?.enabled ?? false} onCheckedChange={() => p && setP({ ...p, enabled: !p.enabled })} label="Use answer preferences" hideLabel describedBy="pers-h-d" disabled={!p} />
      </div>
      <p className={s.note} id="pers-h-d">Tell Keplar about you and how you like answers. Every model on the panel and the final answer follow it, in every chat (private chats too). It is separate from memory: nothing here is learned automatically, and you can change or clear it any time.{plan === "free" ? " On the Free plan, \u201cAbout you\u201d isn't sent to the free models (their hosts may log prompts); your style and answer instructions are." : ""}</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      {p ? (
        <form className={s.form} onSubmit={save}>
          <label className={s.fieldLabel} htmlFor="pref-style">Answer style</label>
          <select id="pref-style" className={s.input} value={p.style} onChange={(e) => setP({ ...p, style: e.target.value })}>
            {styles.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {hint ? <p className={s.note}>{hint}</p> : null}
          {p.style === "custom" ? (<>
            <label className={s.fieldLabel} htmlFor="pref-custom">Describe your style</label>
            <textarea id="pref-custom" style={area} maxLength={600} value={p.customStyle} onChange={(e) => setP({ ...p, customStyle: e.target.value })} placeholder="e.g. Bullet points, British spelling, end with one next step" />
          </>) : null}
          <label className={s.fieldLabel} htmlFor="pref-about">About you</label>
          <textarea id="pref-about" style={area} maxLength={1500} value={p.aboutYou} onChange={(e) => setP({ ...p, aboutYou: e.target.value })} placeholder="e.g. I run a small bakery in Leeds and I'm learning bookkeeping" />
          <label className={s.fieldLabel} htmlFor="pref-location">Your location (optional)</label>
          <input id="pref-location" className={s.input} maxLength={120} value={p.location ?? ""} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="e.g. Austin, Texas" autoComplete="address-level2" />
          <p className={s.note}>
            Used only when place matters (units, prices, local rules, opening hours). Keplar never reads your device&rsquo;s location.{" "}
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setP({ ...p, location: tzPlace() })}>Use my time zone</button>
          </p>
          <label className={s.fieldLabel} htmlFor="pref-how">How should Keplar answer?</label>
          <textarea id="pref-how" style={area} maxLength={1500} value={p.howToAnswer} onChange={(e) => setP({ ...p, howToAnswer: e.target.value })} placeholder="e.g. Use metric units. Show formulas for any calculation." />
          <p className={s.note}>Don&rsquo;t include passwords, card numbers or other secrets.</p>
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void clear()}>Clear all</button>
          </div>
        </form>
      ) : !error ? <p className={s.note}>Loading…</p> : null}
    </div>
  );
}

/** A coarse place from the browser's time zone (e.g. "New York area (America/New_York)"); nothing is looked up. */
function tzPlace(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "";
  return city ? `${city} area (${tz})` : "";
}

const DIRECTORY_CHOICES: [string, string][] = [["writing", "Writing"], ["learning", "Learning"], ["work", "Work"], ["coding", "Coding"], ["research", "Research"], ["everyday", "Everyday"], ["other", "Other"]];

type Specialist = { id: string; name: string; description: string; instructions: string; knowledge: string; starters: string[]; updatedAt?: string };
const blank = (): Specialist => ({ id: "", name: "", description: "", instructions: "", knowledge: "", starters: [] });

export function SpecialistsSettings() {
  const [items, setItems] = useState<Specialist[] | null>(null);
  const [limit, setLimit] = useState(3);
  const [knowledgeUsed, setKnowledgeUsed] = useState(false);
  const [edit, setEdit] = useState<Specialist | null>(null);
  const [startersText, setStartersText] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<{ id: string; includeNotes: boolean; url: string; category?: string } | null>(null);
  const listIt = async () => {
    if (!sharing?.url) return;
    setError(""); setNote("");
    try {
      const token = sharing.url.split("/sp/")[1] ?? "";
      const r = await api<{ listing: { status: string; note: string | null } }>("/api/specialists/directory", { method: "POST", body: JSON.stringify({ token, category: sharing.category ?? "other" }) });
      setNote(r.listing.status === "rejected" ? (r.listing.note ?? "It can't be listed.") : "Sent for review. It appears in the directory once a person at Keplar approves it.");
    } catch (er) { setError((er as Error).message); }
  };
  const share = async () => {
    if (!sharing) return;
    setError(""); setNote("");
    try {
      const r = await api<{ link: { url: string } }>("/api/specialists/share", { method: "POST", body: JSON.stringify({ specialistId: sharing.id, includeNotes: sharing.includeNotes }) });
      setSharing({ ...sharing, url: r.link.url });
      await navigator.clipboard?.writeText(r.link.url).then(() => setNote("Link copied."), () => undefined);
    } catch (er) { setError((er as Error).message); }
  };
  const load = () => api<{ specialists: Specialist[]; limit: number; knowledgeUsed: boolean }>("/api/specialists").then((r) => { setItems(r.specialists); setLimit(r.limit); setKnowledgeUsed(r.knowledgeUsed); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const open = (x: Specialist) => { setEdit(x); setStartersText(x.starters.join("\n")); setNote(""); setError(""); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true); setError(""); setNote("");
    const payload = { name: edit.name, description: edit.description, instructions: edit.instructions, knowledge: edit.knowledge, starters: startersText.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 4) };
    try {
      if (edit.id) await api(`/api/specialists/${encodeURIComponent(edit.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/specialists", { method: "POST", body: JSON.stringify(payload) });
      setEdit(null); setNote("Saved. Pick it from \u201cSpecialist\u201d above the message box."); await load();
    } catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  };
  const remove = async (x: Specialist) => {
    if (!(await confirmAction({ title: `Delete the specialist \u201c${x.name}\u201d?`, body: "Chats that used it keep their answers.", confirmLabel: "Delete specialist", danger: true }))) return;
    setError("");
    try { await api(`/api/specialists/${encodeURIComponent(x.id)}`, { method: "DELETE" }); setItems((v) => (v ?? []).filter((i) => i.id !== x.id)); setNote("Deleted."); } catch (er) { setError((er as Error).message); }
  };
  return (
    <div className={s.panel} id="specialists" aria-labelledby="spec-h">
      <h2 id="spec-h" className={s.cardTitle}>Specialists</h2>
      <p className={s.note}>A specialist is a saved setup for one kind of work: its own instructions, reference notes and conversation starters. Choose one for a chat from &ldquo;Specialist&rdquo; above the message box; the whole panel of models answers with it, and Keplar still cross-checks them. You can have {limit}.{knowledgeUsed ? "" : " On the Free plan, reference notes are kept but not sent to the free models (their hosts may log prompts); instructions are."}</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      {edit ? (
        <form className={s.form} onSubmit={save} aria-label={edit.id ? `Edit ${edit.name}` : "New specialist"}>
          <label className={s.fieldLabel} htmlFor="sp-name">Name</label>
          <input id="sp-name" className={s.input} maxLength={60} required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Contract reviewer" />
          <label className={s.fieldLabel} htmlFor="sp-desc">Short description</label>
          <input id="sp-desc" className={s.input} maxLength={160} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Shown when you pick it" />
          <label className={s.fieldLabel} htmlFor="sp-ins">Instructions</label>
          <textarea id="sp-ins" style={area} maxLength={4000} required value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} placeholder="What it should do, how it should answer, what to always check" />
          <label className={s.fieldLabel} htmlFor="sp-know">Reference notes (optional)</label>
          <textarea id="sp-know" style={{ ...area, minHeight: 160 }} maxLength={12000} value={edit.knowledge} onChange={(e) => setEdit({ ...edit, knowledge: e.target.value })} placeholder="Paste facts, policies or a style guide it should rely on" />
          <label className={s.fieldLabel} htmlFor="sp-start">Conversation starters, one per line (up to 4)</label>
          <textarea id="sp-start" style={{ ...area, minHeight: 80 }} maxLength={800} value={startersText} onChange={(e) => setStartersText(e.target.value)} />
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy || !edit.name.trim() || !edit.instructions.trim()}>{busy ? "Saving…" : "Save specialist"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className={s.actions}><button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={!items || items.length >= limit} onClick={() => open(blank())}>New specialist</button></div>
      )}
      {items?.length ? (
        <ul style={list} aria-label="Your specialists">
          {items.map((x) => (
            <li key={x.id} className={s.row} style={item}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{x.name}{x.description ? <span className={s.sub}>{x.description}</span> : null}</span>
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => open(x)} aria-label={`Edit ${x.name}`}>Edit</button>
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} aria-expanded={sharing?.id === x.id} onClick={() => setSharing(sharing?.id === x.id ? null : { id: x.id, includeNotes: false, url: "" })} aria-label={`Share ${x.name}`}>Share</button>
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void remove(x)} aria-label={`Delete ${x.name}`}>Delete</button>
              {sharing?.id === x.id ? (
                <div style={{ flexBasis: "100%", display: "grid", gap: "var(--s-2)" }} data-specialist-share="">
                  <p className={s.note} style={{ margin: 0 }}>Anyone with the link can read this specialist&rsquo;s name, description, instructions and starters, and add a copy to their own account. They never see your chats. The link shows it as it is now; later edits aren&rsquo;t shared.</p>
                  {x.knowledge ? (
                    <label className={s.note} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", margin: 0 }}>
                      <input type="checkbox" checked={sharing.includeNotes} disabled={Boolean(sharing.url)} onChange={(e) => setSharing({ ...sharing, includeNotes: e.target.checked })} /> Include the reference notes
                    </label>
                  ) : null}
                  {sharing.url ? (<>
                    <input className={s.input} readOnly value={sharing.url} aria-label="Specialist link" onFocus={(e) => e.currentTarget.select()} />
                    <div className={s.actions} style={{ alignItems: "center" }}>
                      <label className={s.note} htmlFor={`dir-${x.id}`} style={{ margin: 0 }}>List it in the public <a href="/specialists" target="_blank" rel="noopener noreferrer">directory</a> under</label>
                      <select id={`dir-${x.id}`} className={s.input} style={{ width: "auto" }} value={sharing.category ?? "other"} onChange={(e) => setSharing({ ...sharing, category: e.target.value })}>
                        {DIRECTORY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => void listIt()}>Ask to list</button>
                    </div>
                  </>) : (
                    <div className={s.actions}><button type="button" className={s.btn} onClick={() => void share()}>Create link</button></div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : items ? <p className={s.note}>No specialists yet.</p> : !error ? <p className={s.note}>Loading…</p> : null}
    </div>
  );
}

type AnswerLink = { token: string; url: string; createdAt: string; expiresAt: string; views: number; preview: string };
type SpecialistLink = { token: string; url: string; name: string; includesNotes: boolean; createdAt: string; expiresAt: string; views: number; copies: number };
type ChatLink = { token: string; url: string; title: string; turns: number; hidden: number; createdAt: string; expiresAt: string; views: number };

export function SharedLinksSettings() {
  const [answers, setAnswers] = useState<AnswerLink[] | null>(null);
  const [chats, setChats] = useState<ChatLink[] | null>(null);
  const [specs, setSpecs] = useState<SpecialistLink[] | null>(null);
  const [listings, setListings] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    api<{ links: AnswerLink[] }>("/api/share").then((r) => setAnswers(r.links)).catch((e: Error) => setError(e.message));
    api<{ links: ChatLink[] }>("/api/share/chat").then((r) => setChats(r.links)).catch((e: Error) => setError(e.message));
    api<{ links: SpecialistLink[] }>("/api/specialists/share").then((r) => setSpecs(r.links)).catch((e: Error) => setError(e.message));
    api<{ listings: { token: string; status: string }[] }>("/api/specialists/directory").then((r) => setListings(Object.fromEntries(r.listings.map((x) => [x.token, x.status])))).catch(() => undefined);
  }, []);
  const revoke = async (kind: "answer" | "chat" | "specialist", token: string) => {
    setError(""); setNote("");
    try {
      await api(kind === "chat" ? "/api/share/chat" : kind === "specialist" ? "/api/specialists/share" : "/api/share", { method: "DELETE", body: JSON.stringify({ token }) });
      if (kind === "chat") setChats((v) => (v ?? []).filter((x) => x.token !== token));
      else if (kind === "specialist") setSpecs((v) => (v ?? []).filter((x) => x.token !== token));
      else setAnswers((v) => (v ?? []).filter((x) => x.token !== token));
      setNote("Revoked. The link now shows \u201cnot found\u201d.");
    } catch (er) { setError((er as Error).message); }
  };
  const row = (kind: "answer" | "chat" | "specialist", token: string, url: string, label: string, meta: string) => (
    <li key={token} className={s.row} style={item}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{label}<span className={s.sub}>{meta}</span></span>
      <a className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href={url} target="_blank" rel="noopener noreferrer">Open</a>
      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void revoke(kind, token)} aria-label={`Revoke link: ${label}`}>Revoke</button>
    </li>
  );
  const none = answers && chats && specs && !answers.length && !chats.length && !specs.length;
  return (
    <div className={s.panel} id="shared-links" aria-labelledby="links-h">
      <h2 id="links-h" className={s.cardTitle}>Shared links</h2>
      <p className={s.note}>Every live link you created to an answer, a chat or a specialist. Revoking one takes it down at once. Answer and chat links expire after 90 days, specialist links after 180.</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      {none ? <p className={s.note}>You haven&rsquo;t shared anything.</p> : null}
      {chats?.length ? (<>
        <p className={s.fieldLabel}>Chats</p>
        <ul style={list} aria-label="Shared chats">{chats.map((x) => row("chat", x.token, x.url, x.title, `${x.turns} turns${x.hidden ? ` · ${x.hidden} hidden` : ""} · ${x.views} views · expires ${when(x.expiresAt)}`))}</ul>
      </>) : null}
      {specs?.length ? (<>
        <p className={s.fieldLabel}>Specialists</p>
        <ul style={list} aria-label="Shared specialists">{specs.map((x) => row("specialist", x.token, x.url, x.name, `${x.includesNotes ? "with reference notes · " : ""}${listings[x.token] ? `directory: ${listings[x.token] === "pending" ? "waiting for review" : listings[x.token]} · ` : ""}${x.views} views · ${x.copies} copies · expires ${when(x.expiresAt)}`))}</ul>
      </>) : null}
      {answers?.length ? (<>
        <p className={s.fieldLabel}>Answers</p>
        <ul style={list} aria-label="Shared answers">{answers.map((x) => row("answer", x.token, x.url, x.preview || "Shared answer", `${x.views} views · expires ${when(x.expiresAt)}`))}</ul>
      </>) : null}
      {!answers && !chats && !error ? <p className={s.note}>Loading…</p> : null}
    </div>
  );
}

type Family = { enabled: boolean; guideHomework: boolean; locked: boolean; lockedUntil: string | null };

/** Family mode: on with a new PIN; off, homework guidance or a new PIN only with the current PIN; reset after a fresh sign-in. */
export function FamilySettings() {
  const [f, setF] = useState<Family | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [homework, setHomework] = useState(true);
  const [mode, setMode] = useState<"idle" | "change" | "reset">("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Family>("/api/family").then((r) => { setF(r); setHomework(r.enabled ? r.guideHomework : true); }).catch((e: Error) => setError(e.message)); }, []);
  const send = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true); setError(""); setNote("");
    try { const r = await api<Family>("/api/family", { method: "POST", body: JSON.stringify(payload) }); setF(r); setPin(""); setNewPin(""); setMode("idle"); setNote(done); }
    catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  };
  const pinInput = (id: string, label: string, value: string, set: (v: string) => void) => (<>
    <label className={s.fieldLabel} htmlFor={id}>{label}</label>
    <input id={id} className={s.input} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={8} value={value} onChange={(e) => set(e.target.value.replace(/\D/g, ""))} style={{ maxWidth: 200 }} />
  </>);
  return (
    <div className={s.panel} id="family" aria-labelledby="family-h">
      <h2 id="family-h" className={s.cardTitle}>Family mode</h2>
      <p className={s.note}>
        For an account a teenager uses (Keplar is for ages 13 and up). Every answer, including ones through an API key or embed on this account, follows age-appropriate rules, and Private chat, Talk live and Posts on X are hidden so chats stay in history. Turning it off or changing it needs your PIN.
        These rules guide the models; they don&rsquo;t guarantee every answer, so stay involved.
      </p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      {!f ? (!error ? <p className={s.note}>Loading…</p> : null) : !f.enabled ? (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void send({ action: "enable", pin: newPin, guideHomework: homework }, "Family mode is on."); }}>
          {pinInput("fam-new", "Choose a PIN (4 to 8 digits; not 1234 or 0000)", newPin, setNewPin)}
          <label className={s.note} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
            <input type="checkbox" checked={homework} onChange={(e) => setHomework(e.target.checked)} /> Homework help teaches instead of handing over answers
          </label>
          <div className={s.actions}><button type="submit" className={s.btn} disabled={busy || newPin.length < 4}>{busy ? "Turning on…" : "Turn on Family mode"}</button></div>
        </form>
      ) : (
        <div className={s.form}>
          <p className={s.note} role="status"><strong>On.</strong> Homework help {f.guideHomework ? "teaches instead of handing over answers" : "answers directly"}.{f.locked && f.lockedUntil ? ` Locked after too many wrong PINs until ${new Date(f.lockedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : ""}</p>
          {mode === "reset" ? (<>
            <p className={s.note}>Forgot the PIN? Sign out, sign in again with your email link, then come back here within 10 minutes to set a new one. Family mode stays on.</p>
            {pinInput("fam-reset", "New PIN", newPin, setNewPin)}
            <div className={s.actions}>
              <button type="button" className={s.btn} disabled={busy || newPin.length < 4} onClick={() => void send({ action: "reset", newPin }, "New PIN saved.")}>Save new PIN</button>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setMode("idle")}>Cancel</button>
            </div>
          </>) : (<>
            {pinInput("fam-pin", "Your PIN", pin, setPin)}
            {mode === "change" ? (<>
              {pinInput("fam-change", "New PIN", newPin, setNewPin)}
              <label className={s.note} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                <input type="checkbox" checked={homework} onChange={(e) => setHomework(e.target.checked)} /> Homework help teaches instead of handing over answers
              </label>
              <div className={s.actions}>
                <button type="button" className={s.btn} disabled={busy || pin.length < 4} onClick={() => void send({ action: "update", pin, guideHomework: homework, ...(newPin ? { newPin } : {}) }, "Saved.")}>Save changes</button>
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setMode("idle")}>Cancel</button>
              </div>
            </>) : (
              <div className={s.actions}>
                <button type="button" className={s.btn} disabled={busy || pin.length < 4} onClick={() => void send({ action: "disable", pin }, "Family mode is off.")}>Turn off</button>
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setMode("change")}>Change settings or PIN</button>
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setMode("reset"); setNewPin(""); }}>Forgot PIN</button>
              </div>
            )}
          </>)}
        </div>
      )}
    </div>
  );
}
