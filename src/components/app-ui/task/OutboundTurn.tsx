"use client";
/**
 * "Email Sam about Friday" / "put a meeting with Sam on Friday": the person's own Gmail or Google Calendar, never Keplar Browser.
 * The card shows the whole email or event, editable. Nothing leaves Keplar until the person presses Send email / Add to
 * calendar; that press goes through the Approvals path (/api/business/chat-outbound), and the card only says "Sent" or "Added"
 * when the provider confirmed it. When Gmail or Calendar can't be used here, the card opens Google's own compose page instead,
 * where the person sends it themselves.
 */
import { useEffect, useId, useRef, useState } from "react";
import { calendarTemplateUrl, dateTile, eventTimes, gmailComposeUrl, isAddress, timeRange } from "@/lib/chat-actions/outbound-view";
import type { KeplarMessage, OutboundCard, OutboundState } from "../state/types";
import s from "./OutboundTurn.module.css";

type Props = { message: KeplarMessage; isLast: boolean; onPatch: (patch: Partial<OutboundCard>) => void };
type Reply<T> = { ok: true; data: T } | { ok: false; error: string; status: number; code?: string };

async function api<T>(path: string, init?: RequestInit): Promise<Reply<T>> {
  try {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const j = (await r.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
    if (r.status === 401) return { ok: false, error: "Sign in so Keplar can use your Google account.", status: 401, code: "signin" };
    if (!r.ok || !j) return { ok: false, error: j?.error ?? "Keplar couldn't be reached. Nothing was sent.", status: r.status, code: j?.code };
    return { ok: true, data: j };
  } catch {
    return { ok: false, error: "Keplar couldn't be reached. Check your connection; nothing was sent.", status: 0 };
  }
}

const LABEL = { email: { app: "Gmail", tool: "Send email", connector: "gmail" }, event: { app: "Google Calendar", tool: "Create event", connector: "gcal" } } as const;
const CODE_STATE: Record<string, OutboundState> = { not_connected: "not_connected", tool_disabled: "tool_off", not_configured: "not_configured" };
const LENGTHS = [15, 30, 45, 60, 90, 120];
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/** Opening the provider's sign-in page (OAuth) for Gmail or Calendar; Keplar comes back to this chat afterwards. */
async function connect(connector: "gmail" | "gcal"): Promise<string | null> {
  const r = await api<{ url: string }>("/api/business/connectors/oauth/start", { method: "POST", body: JSON.stringify({ connector }) });
  if (!r.ok) return r.error;
  window.location.assign(r.data.url);
  return null;
}

export function OutboundTurn({ message, isLast, onPatch }: Props) {
  const c = message.outbound!;
  const L = LABEL[c.kind];
  const uid = useId();
  const [busy, setBusy] = useState<null | "connect" | "tool">(null);
  // The fields are the person's: edited here, saved to the card when they leave a field or press the button.
  const [to, setTo] = useState(c.to && isAddress(c.to) ? c.to : "");
  const [subject, setSubject] = useState(c.subject ?? "");
  const [body, setBody] = useState(c.body ?? "");
  const [title, setTitle] = useState(c.title ?? "");
  const [date, setDate] = useState(c.date ?? "");
  const [time, setTime] = useState(c.time ?? "");
  const [minutes, setMinutes] = useState(c.minutes ?? 30);
  const [notes, setNotes] = useState(c.description ?? "");
  const [touched, setTouched] = useState(false);
  const asked = useRef(false);

  // Email: one starting draft (a model when available, else Keplar's plain template), plus whether Gmail is ready.
  useEffect(() => {
    if (c.kind !== "email" || c.phase !== "drafting" || asked.current) return;
    asked.current = true;
    void (async () => {
      const r = await api<{ subject: string; body: string; by: "keplar" | "template"; state: OutboundState }>("/api/business/chat-outbound", { method: "POST", body: JSON.stringify({ op: "draft", to: c.to ?? "", about: c.about ?? "" }) });
      const subj = r.ok ? r.data.subject : (c.about ?? "").replace(/^\w/, (x) => x.toUpperCase()).slice(0, 80);
      const text = r.ok ? r.data.body : `Hi${c.to && !isAddress(c.to) ? ` ${c.to}` : ""},\n\n`;
      setSubject(subj);
      setBody(text);
      onPatch({ phase: "ready", subject: subj, body: text, by: r.ok ? r.data.by : "template", ...(r.ok ? { state: r.data.state } : { error: r.error }) });
    })();
  }, [c.kind, c.phase, c.to, c.about, onPatch]);

  // Event: whether Calendar is ready (the event itself needs no model).
  useEffect(() => {
    if (c.kind !== "event" || c.state || c.phase !== "ready" || asked.current) return;
    asked.current = true;
    void api<{ state: OutboundState }>("/api/business/chat-outbound?connector=gcal").then((r) => onPatch(r.ok ? { state: r.data.state } : { error: r.error }));
  }, [c.kind, c.state, c.phase, onPatch]);

  // Until an address is typed, the card keeps the name the person said ("Sam"), so the hints can still use it.
  const save = () => onPatch(c.kind === "email" ? { to: to.trim() || c.to, subject, body } : { title, date, time, minutes, description: notes });
  const times = c.kind === "event" ? eventTimes(date, time, minutes) : null;
  const problem =
    c.kind === "email"
      ? !isAddress(to) ? (to ? "That doesn't look like an email address." : `Add ${c.to && !isAddress(c.to) ? `${c.to}'s` : "an"} email address.`) : !subject.trim() ? "Add a subject." : !body.trim() ? "The email is empty." : null
      : !title.trim() ? "Give the event a name." : !date ? "Pick a day." : !time ? "Pick a start time." : !times ? "Pick a day and a time." : null;
  const locked = c.phase === "sending" || c.phase === "sent" || c.phase === "canceled" || !isLast;
  const fallback = c.kind === "email" ? gmailComposeUrl(to, subject, body) : calendarTemplateUrl(title, date, time, minutes, notes);

  async function send() {
    setTouched(true);
    if (problem) return;
    save();
    onPatch({ phase: "sending", error: undefined });
    const payload = c.kind === "email" ? { op: "send", kind: "email", key: c.key, to: to.trim(), subject, body } : { op: "send", kind: "event", key: c.key, title, description: notes, start: times!.start, end: times!.end };
    const r = await api<{ approval: { id: string; status: string; result: string | null } }>("/api/business/chat-outbound", { method: "POST", body: JSON.stringify(payload) });
    if (!r.ok) return onPatch({ phase: "failed", error: r.error, ...(r.code && CODE_STATE[r.code] ? { state: CODE_STATE[r.code], phase: "ready" } : {}) });
    const a = r.data.approval;
    if (a.status === "sent") return onPatch({ phase: "sent", approvalId: a.id, result: a.result ?? undefined });
    onPatch({ phase: "failed", approvalId: a.id, error: a.status === "failed" ? a.result ?? `${L.app} didn't confirm it, so it may not have happened. Check ${L.app} before trying again.` : a.status === "rejected" ? "This was rejected in Approvals. Nothing was sent." : `It is waiting in Approvals; it hasn't gone out yet.` });
  }

  async function turnOn() {
    setBusy("tool");
    const tool = c.kind === "email" ? "send_email" : "create_event";
    const r = await api("/api/business/connectors/tools", { method: "POST", body: JSON.stringify({ connector: L.connector, tool, enabled: true }) });
    setBusy(null);
    onPatch(r.ok ? { state: "ready", error: undefined } : { error: r.error });
  }

  const tile = c.kind === "event" ? dateTile(date) : null;
  const range = c.kind === "event" ? timeRange(time, minutes) : null;
  const head = c.kind === "email" ? (c.phase === "sent" ? "Email sent" : "Email draft") : c.phase === "sent" ? "Added to your calendar" : "New calendar event";
  const sending = c.phase === "sending";

  return (
    <section className={`${s.card} k-enter`} aria-label={head} aria-busy={c.phase === "drafting" || sending || undefined}>
      <header className={s.head}>
        <span className={s.app} data-app={c.kind}>{c.kind === "email" ? <MailIcon /> : <CalIcon />}</span>
        <div className={s.headText}>
          <h3 className={s.title}>{head}</h3>
          <p className={s.sub}>{c.kind === "email" ? "From your Gmail" : "On your Google Calendar"}</p>
        </div>
      </header>

      {c.kind === "email" ? (
        c.phase === "drafting" ? (
          <p className={s.note} role="status">Writing a draft…</p>
        ) : (
          <div className={s.sheet}>
            <div className={s.row}>
              <label htmlFor={`${uid}-to`}>To</label>
              <input id={`${uid}-to`} type="email" inputMode="email" autoComplete="email" placeholder={c.to && !isAddress(c.to) ? `${c.to}'s email address` : "name@example.com"} value={to} readOnly={locked} onChange={(e) => setTo(e.target.value)} onBlur={save} aria-invalid={touched && !isAddress(to) ? true : undefined} />
            </div>
            <div className={s.row}>
              <label htmlFor={`${uid}-subj`}>Subject</label>
              <input id={`${uid}-subj`} type="text" value={subject} readOnly={locked} maxLength={200} onChange={(e) => setSubject(e.target.value)} onBlur={save} />
            </div>
            <label className="visually-hidden" htmlFor={`${uid}-body`}>Message</label>
            <textarea id={`${uid}-body`} className={s.body} value={body} readOnly={locked} rows={Math.min(12, Math.max(5, body.split("\n").length + 1))} maxLength={10000} onChange={(e) => setBody(e.target.value)} onBlur={save} />
          </div>
        )
      ) : (
        <div className={s.event}>
          <div className={s.tile} aria-hidden="true">
            <span className={s.tileMonth}>{tile?.month ?? "Day"}</span>
            <span className={s.tileDay}>{tile?.day ?? "?"}</span>
          </div>
          <div className={s.fields}>
            <div className={s.field}>
              <label htmlFor={`${uid}-title`}>Event</label>
              <input id={`${uid}-title`} type="text" value={title} readOnly={locked} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={save} />
            </div>
            <div className={s.when}>
              <div className={s.field}>
                <label htmlFor={`${uid}-date`}>Day</label>
                <input id={`${uid}-date`} type="date" value={date} readOnly={locked} onChange={(e) => setDate(e.target.value)} onBlur={save} />
              </div>
              <div className={s.field}>
                <label htmlFor={`${uid}-time`}>Starts</label>
                <input id={`${uid}-time`} type="time" value={time} readOnly={locked} onChange={(e) => setTime(e.target.value)} onBlur={save} aria-invalid={touched && !time ? true : undefined} />
              </div>
              <div className={s.field}>
                <label htmlFor={`${uid}-len`}>Length</label>
                <select id={`${uid}-len`} value={minutes} disabled={locked} onChange={(e) => { setMinutes(Number(e.target.value)); onPatch({ minutes: Number(e.target.value) }); }}>
                  {[...new Set([...LENGTHS, minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{lengthLabel(m)}</option>)}
                </select>
              </div>
            </div>
            <div className={s.field}>
              <label htmlFor={`${uid}-notes`}>Notes <span className={s.optional}>(optional)</span></label>
              <input id={`${uid}-notes`} type="text" value={notes} readOnly={locked} maxLength={4000} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
            </div>
          </div>
        </div>
      )}

      {/* What Keplar assumed, said plainly. */}
      <ul className={s.facts}>
        {c.kind === "email" && c.phase !== "drafting" ? <li>{c.by === "keplar" ? "Keplar wrote this draft. Read it before you send." : "A starting draft. Make it yours before you send."}</li> : null}
        {c.kind === "email" && c.to && !isAddress(c.to) && !isAddress(to) ? <li>Keplar doesn&apos;t have {c.to}&apos;s address. Type it above.</li> : null}
        {c.kind === "event" && c.words && tile ? <li>Read from &ldquo;{c.words}&rdquo;: {tile.weekday}{range ? `, ${range}` : ""}. Change it above if that&apos;s wrong.</li> : null}
        {c.kind === "event" && !c.time ? <li>You didn&apos;t say a time, so pick one.</li> : null}
        {c.kind === "event" && c.with ? <li>{c.with} won&apos;t get an invite. This adds the event to your calendar only.</li> : null}
      </ul>

      {touched && problem && !locked ? <p className={s.error} role="alert">{problem}</p> : null}
      {c.error && c.phase !== "sent" ? <p className={s.error} role="alert">{c.error}</p> : null}

      <div className={s.actions} aria-live="polite">
        {c.phase === "sent" ? (
          <p className={s.done} role="status">
            <CheckIcon /> {c.result ?? (c.kind === "email" ? "Sent" : "Added")}
          </p>
        ) : c.phase === "canceled" ? (
          <p className={s.note}>{c.kind === "email" ? "Not sent. The draft stays here." : "Not added to your calendar."}</p>
        ) : c.phase === "drafting" ? null : c.state === "not_connected" ? (
          <>
            <button type="button" className="k3d k3d-primary" disabled={!isLast || busy !== null} onClick={async () => { setBusy("connect"); const err = await connect(L.connector); setBusy(null); if (err) onPatch({ error: err }); }}>
              {busy === "connect" ? "Opening Google…" : `Connect ${L.app}`}
            </button>
            {fallback ? <a className="k3d" href={fallback} target="_blank" rel="noopener noreferrer">{c.kind === "email" ? "Open in Gmail" : "Open in Google Calendar"}</a> : null}
          </>
        ) : c.state === "tool_off" ? (
          <>
            <button type="button" className="k3d k3d-primary" disabled={!isLast || busy !== null} onClick={() => void turnOn()}>{busy === "tool" ? "Turning on…" : `Allow ${L.tool}`}</button>
            <p className={s.hint}>{L.tool} is off for {L.app}. Allowing it still asks you before each one.</p>
          </>
        ) : !c.state ? (
          <>
            <a className="k3d k3d-primary" href="/signin?next=/app">Sign in</a>
            {fallback ? <a className="k3d" href={fallback} target="_blank" rel="noopener noreferrer">{c.kind === "email" ? "Open in Gmail" : "Open in Google Calendar"}</a> : null}
          </>
        ) : c.state === "not_configured" ? (
          fallback ? <a className="k3d k3d-primary" href={fallback} target="_blank" rel="noopener noreferrer">{c.kind === "email" ? "Open in Gmail" : "Open in Google Calendar"}</a> : null
        ) : (
          <>
            <button type="button" className="k3d k3d-primary" disabled={!isLast || sending} onClick={() => void send()}>
              {sending ? (c.kind === "email" ? "Sending…" : "Adding…") : c.phase === "failed" ? "Try again" : c.kind === "email" ? "Send email" : "Add to calendar"}
            </button>
            <button type="button" className="k3d" disabled={!isLast || sending} onClick={() => { save(); onPatch({ phase: "canceled" }); }}>{c.kind === "email" ? "Don’t send" : "Don’t add"}</button>
          </>
        )}
      </div>
      {c.state === "not_configured" && c.phase !== "sent" ? <p className={s.hint}>{L.app} can&apos;t be connected to Keplar yet, so {c.kind === "email" ? "send it from Gmail" : "save it in Google Calendar"} yourself.</p> : null}
    </section>
  );
}

function MailIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m3.5 6 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}
function CalIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><path d="m4 8.5 2.6 2.6L12 5.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
