"use client";
/**
 * Settings > Team in Keplar Business: the owner (and admins) invite people up to the plan's seats, change their roles and
 * remove them; everyone sees who is on the team. Built on Keplar's team API (/api/team): an invite is drafted, then sent by
 * email, or turned into a one-time link when email isn't available. Invited people sign in with the invited address, accept,
 * and then work in this Business workspace with their role (src/lib/business/team.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { confirmAction } from "@/components/kit";
import s from "./settings.module.css";

type Role = "owner" | "admin" | "member" | "viewer";
type Member = { id: string; email: string; name: string | null; role: Role; you: boolean };
type Invite = { id: string; email: string; role: Role; status: "draft" | "sent"; expiresAt: string | null };
type Detail = { team: { id: string; name: string }; role: Role; members: Member[]; invites: Invite[]; capacity: { members: number; maxMembers: number; openInvites: number }; paused: boolean };
type Summary = { owned: string | null; teams: { id: string; name: string; role: Role }[]; eligible: boolean };

const LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Editor", viewer: "Viewer" };
const BLURB: Record<Exclude<Role, "owner">, string> = { admin: "Everything an editor can, plus delete and invite", member: "Creates and changes agents, builds and reports", viewer: "Sees everything, changes nothing" };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? "That didn't work. Try again.");
  return d as T;
}

export function TeamPanel({ company, seats, say }: { company: string | null; seats: number | null; say: (m: string) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("member");
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const sm = await call<Summary>("/api/team");
      setSummary(sm);
      const id = sm.owned ?? sm.teams[0]?.id ?? null;
      setDetail(id ? await call<Detail>(`/api/team/${id}`) : null);
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const manage = detail ? detail.role === "owner" || detail.role === "admin" : Boolean(summary?.eligible);
  const limit = detail?.capacity.maxMembers ?? seats ?? null;
  const used = detail ? detail.capacity.members + detail.capacity.openInvites : 1;
  const full = limit !== null && used >= limit;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("invite");
    setLink(null);
    try {
      let teamId = detail?.team.id ?? null;
      // The first invite creates the company's team, named after the business.
      if (!teamId) teamId = (await call<{ team: { id: string } }>("/api/team", { method: "POST", body: JSON.stringify({ name: company || "My company" }) })).team.id;
      const inv = await call<{ invite: { id: string; email: string } }>(`/api/team/${teamId}/invites`, { method: "POST", body: JSON.stringify({ email: email.trim(), role }) });
      const sent = await call<{ emailed: boolean; emailAvailable: boolean }>(`/api/team/${teamId}/invites/${inv.invite.id}`, { method: "POST", body: JSON.stringify({ via: "email" }) });
      if (sent.emailed) say(`Invite sent to ${inv.invite.email}.`);
      else {
        // No mail service: a one-time link to pass on yourself (shown once).
        const l = await call<{ link: string | null }>(`/api/team/${teamId}/invites/${inv.invite.id}`, { method: "POST", body: JSON.stringify({ via: "link" }) });
        if (l.link) setLink({ email: inv.invite.email, url: l.link });
      }
      setEmail("");
      await load();
    } catch (e2) { say((e2 as Error).message); } finally { setBusy(""); }
  };

  const copyLink = async (inv: Invite) => {
    if (!detail) return;
    setBusy(inv.id);
    try {
      const l = await call<{ link: string | null }>(`/api/team/${detail.team.id}/invites/${inv.id}`, { method: "POST", body: JSON.stringify({ via: "link" }) });
      if (l.link) { setLink({ email: inv.email, url: l.link }); try { await navigator.clipboard.writeText(l.link); say("Invite link copied."); } catch { /* shown below to copy by hand */ } }
    } catch (e) { say((e as Error).message); } finally { setBusy(""); }
  };
  const revoke = async (inv: Invite) => {
    if (!detail) return;
    setBusy(inv.id);
    try { await call(`/api/team/${detail.team.id}/invites/${inv.id}`, { method: "DELETE" }); say("Invite revoked."); await load(); } catch (e) { say((e as Error).message); } finally { setBusy(""); }
  };
  const changeRole = async (m: Member, next: Role) => {
    if (!detail) return;
    setBusy(m.id);
    try { await call(`/api/team/${detail.team.id}/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role: next }) }); say(`${m.email} is now ${LABEL[next].toLowerCase()}.`); await load(); } catch (e) { say((e as Error).message); } finally { setBusy(""); }
  };
  const remove = async (m: Member) => {
    if (!detail) return;
    if (!(await confirmAction(m.you
      ? { title: `Leave ${detail.team.name}?`, body: "You'll lose access to this Business workspace.", confirmLabel: "Leave", danger: true }
      : { title: `Remove ${m.email} from ${detail.team.name}?`, body: "They lose access at once.", confirmLabel: "Remove", danger: true }))) return;
    setBusy(m.id);
    try { await call(`/api/team/${detail.team.id}/members/${m.id}`, { method: "DELETE" }); say(m.you ? "You left the team." : `${m.email} was removed.`); if (m.you) window.location.reload(); else await load(); } catch (e) { say((e as Error).message); } finally { setBusy(""); }
  };

  if (error) return <p className={s.note} role="alert">{error}</p>;
  if (!summary) return <div className={s.loading} aria-label="Loading"><span /><span /></div>;
  const iAm = detail?.role ?? "owner";

  return (
    <>
      <div className={s.row}>
        <div className={s.rowText}><div className={s.rowLabel}>Seats</div><p className={s.hint}>People on the team, owner included. Open invites hold a seat until they&apos;re accepted or revoked.</p></div>
        <div className={s.rowControl}><span className={s.value}>{limit === null ? "—" : `${used} of ${limit}`}</span></div>
      </div>
      {detail?.paused ? <p className={s.note} role="status">This team is paused because the owner&apos;s plan no longer includes Keplar Business.</p> : null}

      {manage ? (
        <form className={s.invite} onSubmit={(e) => void invite(e)}>
          <h3 className={s.group}>Invite someone</h3>
          <div className={s.inviteRow}>
            <label className={s.srOnly} htmlFor="team-email">Email address</label>
            <input id="team-email" className={s.input} type="email" autoComplete="off" spellCheck={false} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={full || busy === "invite"} />
            <label className={s.srOnly} htmlFor="team-role">Role</label>
            <select id="team-role" className={s.input} data-narrow="" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "owner">)} disabled={full}>
              {iAm === "owner" ? <option value="admin">Admin</option> : null}
              <option value="member">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" className={s.primary} disabled={full || !email.trim() || busy === "invite"}>{busy === "invite" ? "Inviting…" : "Invite"}</button>
          </div>
          <p className={s.hint}>{full ? `Every seat on your plan is in use. Upgrade on the Billing tab for more seats.` : BLURB[role]}. They sign in with this address to accept.</p>
        </form>
      ) : null}

      {link ? (
        <div className={s.linkBox} role="status">
          <p className={s.hint}>Email isn&apos;t available, so send {link.email} this one-time link yourself. It&apos;s shown once.</p>
          <input className={s.input} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label={`Invite link for ${link.email}`} />
        </div>
      ) : null}

      <h3 className={s.group}>Members</h3>
      {(detail?.members ?? []).length ? detail!.members.map((m) => (
        <div key={m.id} className={s.row}>
          <div className={s.rowText}><div className={s.rowLabel}>{m.name || m.email}{m.you ? " (you)" : ""}</div>{m.name ? <p className={s.hint}>{m.email}</p> : null}</div>
          <div className={s.rowControl} data-inline="">
            {manage && m.role !== "owner" && !m.you && (iAm === "owner" || m.role !== "admin") ? (
              <select className={s.input} data-narrow="" value={m.role} onChange={(e) => void changeRole(m, e.target.value as Role)} disabled={busy === m.id} aria-label={`Role for ${m.email}`}>
                {iAm === "owner" ? <option value="admin">Admin</option> : null}
                <option value="member">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : <span className={s.value}>{LABEL[m.role]}</span>}
            {m.role !== "owner" && (m.you || (manage && (iAm === "owner" || m.role !== "admin"))) ? <button type="button" className={s.ghost} onClick={() => void remove(m)} disabled={busy === m.id}>{m.you ? "Leave" : "Remove"}</button> : null}
          </div>
        </div>
      )) : <p className={s.note}>Just you so far. Invited people appear here once they accept.</p>}

      {manage && detail?.invites.length ? (
        <>
          <h3 className={s.group}>Pending invites</h3>
          {detail.invites.map((i) => (
            <div key={i.id} className={s.row}>
              <div className={s.rowText}><div className={s.rowLabel}>{i.email}</div><p className={s.hint}>{LABEL[i.role]} · {i.status === "sent" ? `sent${i.expiresAt ? `, expires ${new Date(i.expiresAt).toLocaleDateString()}` : ""}` : "not sent yet"}</p></div>
              <div className={s.rowControl} data-inline="">
                <button type="button" className={s.ghost} onClick={() => void copyLink(i)} disabled={busy === i.id}>Copy link</button>
                <button type="button" className={s.ghost} onClick={() => void revoke(i)} disabled={busy === i.id}>Revoke</button>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
