"use client";

/**
 * Account → Team workspace (beta). Create the team you own (Business), invite people by email as DRAFTS (nothing is sent until you press
 * Send), change roles, remove people, read the audit log, see the shared pool, export or delete. Every action is checked again on the server
 * by role; the buttons here only hide what your role can't do.
 */
import Link from "next/link";
import { businessUrl } from "@/lib/business-site";
import { useCallback, useEffect, useState } from "react";
import s from "./account.module.css";

type Role = "owner" | "admin" | "member" | "viewer";
type Me = { beta: boolean; plan: string; eligible: boolean; statement: string; scope: { shared: string[]; notShared: string[] }; roles: Record<Role, string>; owned: string | null; teams: { id: string; name: string; role: Role }[]; active: string | null };
type Member = { id: string; email: string; name: string | null; role: Role; addedAt: string; you: boolean };
type Invite = { id: string; email: string; role: Role; status: "draft" | "sent"; createdAt: string; sentAt: string | null; sentVia: "email" | "link" | null; expiresAt: string | null; createdBy: string };
type Detail = {
  team: { id: string; name: string }; role: Role; members: Member[]; invites: Invite[]; audit: { at: string; actor: string | null; action: string; target: string | null; detail: string | null }[];
  capacity: { members: number; maxMembers: number; openInvites: number; maxOpenInvites: number };
  pool: { statement: string; units: number; used: number | null; resetsAt: string | null }; plan: string; paused: boolean;
};

const LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Editor", viewer: "Viewer" };
const AUDIT: Record<string, string> = {
  "team.created": "created the team", "team.renamed": "renamed the team", "invite.drafted": "drafted an invite for", "invite.updated": "changed the draft invite for", "invite.emailed": "emailed an invite to",
  "invite.link_created": "created an invite link for", "invite.revoked": "revoked the invite for", "invite.accepted": "accepted an invite:", "member.role_changed": "changed the role of", "member.removed": "removed",
  "member.left": "left:", "export.downloaded": "downloaded the team export:",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(path, { method, cache: "no-store", credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "That didn't work.");
  return j;
}

export function TeamPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [confirm, setConfirm] = useState("");

  const loadMe = useCallback(async () => {
    try { const m = await api<Me>("/api/team"); setMe(m); setOpen((o) => o ?? m.active ?? m.owned ?? m.teams[0]?.id ?? null); } catch (e) { setErr((e as Error).message); }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    try { setD(await api<Detail>(`/api/team/${id}`)); } catch (e) { setErr((e as Error).message); setD(null); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void loadMe(); }, [loadMe]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on selection, state is set after the awaited request
  useEffect(() => { if (open) void loadDetail(open); }, [open, loadDetail]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(""); setNote("");
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!me) return err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : <p className={s.note}>Loading…</p>;
  const mgr = d ? d.role === "owner" || d.role === "admin" : false;
  const isOwner = d?.role === "owner";
  const assignable: Role[] = d?.role === "owner" ? ["admin", "member", "viewer"] : ["member", "viewer"];

  return (
    <div data-team-panel="">
      <p className={s.note}><span className={s.badge}>Beta</span> Share projects, chats and sites with teammates. {me.statement}</p>
      <div className={s.panel}>
        <div className={s.row}><span className={s.k}>Shared in a team</span><span className={s.v}>{me.scope.shared.join(" · ")}</span></div>
        <div className={s.row}><span className={s.k}>Never shared</span><span className={s.v}>{me.scope.notShared.join(" · ")}</span></div>
      </div>

      {!me.eligible && !me.teams.length ? <p className={s.note} data-team-ineligible="">Team workspaces start on the Business plan, and your plan is {me.plan}. Business is arranged with our team: <a className={s.link} href={businessUrl()}>see Business</a>.</p> : null}
      {me.eligible && !me.owned ? (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await api<{ team: { id: string } }>("/api/team", "POST", { name }); setName(""); await loadMe(); setOpen(r.team.id); }); }}>
          <label className={s.fieldLabel} htmlFor="team-name">Name your team</label>
          <input spellCheck={false} id="team-name" className={s.input} value={name} maxLength={60} placeholder="Acme Studio" onChange={(e) => setName(e.target.value)} />
          <div className={s.actions}><button type="submit" className={`${s.btn} ${s.btnSm}`} disabled={busy}>Create team</button></div>
        </form>
      ) : null}

      {me.teams.length > 1 ? (
        <div className={s.actions} role="group" aria-label="Your teams">
          {me.teams.map((t) => <button key={t.id} type="button" className={`${s.btn} ${t.id === open ? "" : s.btnGhost} ${s.btnSm}`} aria-pressed={t.id === open} onClick={() => setOpen(t.id)}>{t.name} · {LABEL[t.role]}</button>)}
        </div>
      ) : null}

      {d ? (
        <>
          <h3 className={s.sectionHeading}>{d.team.name} <span className={s.sub}>You are {LABEL[d.role].toLowerCase()}</span></h3>
          {d.paused ? <p className={`${s.note} ${s.err}`} role="status">This team is paused: the owner&apos;s plan no longer includes team workspaces. Shared items can&apos;t be opened until the plan is back; the owner can still export or delete the team.</p> : null}
          <div className={s.actions}>
            {me.active === d.team.id ? (
              <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={() => void act(async () => { await api("/api/team/active", "POST", { teamId: null }); await loadMe(); setNote("Back in your personal workspace."); })}>Work in my personal workspace</button>
            ) : (
              <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={busy || d.paused} onClick={() => void act(async () => { await api("/api/team/active", "POST", { teamId: d.team.id }); await loadMe(); setNote("Now working in the team. Open Keplar to use its shared projects, chats and sites."); })}>Work in this team</button>
            )}
            <Link className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href="/app">Open Keplar</Link>
          </div>
          <div className={s.panel}>
            <div className={s.row}><span className={s.k}>Shared pool</span><span className={s.v}>{d.pool.used === null ? "—" : `${Math.max(0, d.pool.units - d.pool.used).toLocaleString("en-US")} of ${d.pool.units.toLocaleString("en-US")} credits left`}{d.pool.resetsAt ? <span className={s.sub}>Renews {new Date(d.pool.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}</span></div>
            <p className={s.note}>{d.pool.statement}</p>
            <div className={s.row}><span className={s.k}>Members</span><span className={s.v}>{d.capacity.members} of {d.capacity.maxMembers}{mgr ? ` · ${d.capacity.openInvites} open invites` : ""}</span></div>
          </div>

          <h3 className={s.sectionHeading}>Members</h3>
          <ul className={s.sessions} aria-label="Members">
            {d.members.map((m) => (
              <li key={m.id} className={s.session} data-member={m.email}>
                <div className={s.sessionInfo}><strong>{m.email}</strong>{m.you ? " (you)" : ""}<span className={s.sub}>{LABEL[m.role]} · joined {when(m.addedAt)}</span></div>
                {m.role !== "owner" && mgr && (isOwner || m.role === "member" || m.role === "viewer") && !m.you ? (
                  <div className={s.actions}>
                    <label className={s.sub} htmlFor={`role-${m.id}`}>Role</label>
                    <select id={`role-${m.id}`} className={s.input} value={m.role} disabled={busy} onChange={(e) => void act(async () => { await api(`/api/team/${d.team.id}/members/${m.id}`, "PATCH", { role: e.target.value }); await loadDetail(d.team.id); })}>
                      {(isOwner ? assignable : assignable).map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}
                    </select>
                    <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.email}? They lose access to the team right away.`)) void act(async () => { await api(`/api/team/${d.team.id}/members/${m.id}`, "DELETE"); await loadDetail(d.team.id); }); }}>Remove</button>
                  </div>
                ) : null}
                {m.you && m.role !== "owner" ? <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={() => { if (window.confirm("Leave this team? You lose access to its shared items.")) void act(async () => { await api(`/api/team/${d.team.id}/members/${m.id}`, "DELETE"); setOpen(null); setD(null); await loadMe(); }); }}>Leave team</button> : null}
              </li>
            ))}
          </ul>
          <details className={s.note}>
            <summary>What each role can do</summary>
            <ul>{(["owner", "admin", "member", "viewer"] as Role[]).map((r) => <li key={r}><strong>{LABEL[r]}:</strong> {me.roles[r]}</li>)}</ul>
          </details>

          {mgr ? (
            <>
              <h3 className={s.sectionHeading}>Invite someone</h3>
              <p className={s.note}>Adding someone makes a <strong>draft</strong>. Nothing is sent until you press Send email, or you copy the link and pass it on yourself. The link works for 7 days, only for that email address, and only once.</p>
              <form className={s.form} onSubmit={(e) => { e.preventDefault(); void act(async () => { await api(`/api/team/${d.team.id}/invites`, "POST", { email, role }); setEmail(""); await loadDetail(d.team.id); setNote("Draft saved. Nothing has been sent."); }); }}>
                <label className={s.fieldLabel} htmlFor="invite-email">Email address</label>
                <input id="invite-email" type="email" className={s.input} value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                <label className={s.fieldLabel} htmlFor="invite-role">Role</label>
                <select id="invite-role" className={s.input} value={role} onChange={(e) => setRole(e.target.value as Role)}>{assignable.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select>
                <div className={s.actions}><button type="submit" className={`${s.btn} ${s.btnSm}`} disabled={busy}>Save draft</button></div>
              </form>
              {d.invites.length ? (
                <ul className={s.sessions} aria-label="Open invites">
                  {d.invites.map((i) => (
                    <li key={i.id} className={s.session} data-invite-row={i.email}>
                      <div className={s.sessionInfo}><strong>{i.email}</strong><span className={s.sub}>{LABEL[i.role]} · {i.status === "draft" ? "Draft, not sent" : `Sent ${i.sentAt ? when(i.sentAt) : ""} ${i.sentVia === "email" ? "by email" : "as a link you copied"}`}{i.expiresAt ? ` · expires ${when(i.expiresAt)}` : ""}</span></div>
                      <div className={s.actions}>
                        <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act(async () => {
                          const r = await api<{ emailed: boolean; emailAvailable: boolean }>(`/api/team/${d.team.id}/invites/${i.id}`, "POST", { via: "email" });
                          setNote(r.emailed ? `Invite emailed to ${i.email}.` : "Email isn't set up on this server, so nothing was sent. Copy the link instead.");
                          await loadDetail(d.team.id);
                        })}>{i.status === "sent" ? "Send again" : "Send email"}</button>
                        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={() => void act(async () => {
                          const r = await api<{ link: string }>(`/api/team/${d.team.id}/invites/${i.id}`, "POST", { via: "link" });
                          setLink({ id: i.id, url: r.link });
                          await loadDetail(d.team.id);
                        })}>Copy link</button>
                        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy} onClick={() => void act(async () => { await api(`/api/team/${d.team.id}/invites/${i.id}`, "DELETE"); if (link?.id === i.id) setLink(null); await loadDetail(d.team.id); })}>Revoke</button>
                      </div>
                      {link?.id === i.id ? (
                        <div>
                          <label className={s.fieldLabel} htmlFor={`link-${i.id}`}>One-time link (shown once; sending again makes a new one)</label>
                          <input id={`link-${i.id}`} className={s.input} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
                          <div className={s.actions}><button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => void navigator.clipboard?.writeText(link.url).then(() => setNote("Link copied."), () => setNote("Select the link and copy it."))}>Copy</button></div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <h3 className={s.sectionHeading}>Audit log</h3>
              {d.audit.length ? (
                <ul className={s.sessions} aria-label="Audit log">
                  {d.audit.slice(0, 40).map((a, k) => <li key={k} className={s.session}><div className={s.sessionInfo}><span>{a.actor ?? "System"} {AUDIT[a.action] ?? a.action} {a.target ?? ""}</span><span className={s.sub}>{when(a.at)}{a.detail ? ` · ${a.detail}` : ""}</span></div></li>)}
                </ul>
              ) : <p className={s.note}>Nothing yet.</p>}
            </>
          ) : null}

          {isOwner ? (
            <>
              <h3 className={s.sectionHeading}>Your data</h3>
              <p className={s.note}>Export everything shared in this team as one file, or delete the team and all of it. Personal workspaces of members are never touched. Deleting can&apos;t be undone.</p>
              <div className={s.actions}><a className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href={`/api/team/${d.team.id}/export`} download>Export team data</a></div>
              <label className={s.fieldLabel} htmlFor="team-del">Type the team name to delete it</label>
              <input id="team-del" className={s.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              <div className={s.actions}><button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy || confirm.trim() !== d.team.name} onClick={() => void act(async () => { await api(`/api/team/${d.team.id}`, "DELETE", { confirm }); setConfirm(""); setOpen(null); setD(null); await loadMe(); setNote("The team and its shared items were deleted."); })}>Delete team</button></div>
            </>
          ) : null}
        </>
      ) : null}
      <p role="status" aria-live="polite" className={s.note}>{note}</p>
      {err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : null}
    </div>
  );
}
