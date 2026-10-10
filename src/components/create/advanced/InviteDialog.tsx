"use client";
/** Invite by link: pick a role (Editor or Viewer), how long the link works and how many people may use it. Revoke any time. */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { initialsOf } from "@/lib/collab/roles";
import s from "./advanced.module.css";
import { useExit } from "@/components/motion/usePresence";

type Inv = { id: string; role: "editor" | "viewer"; createdByName: string; createdAt: string; expiresAt: string; maxUses: number; uses: number };
type Person = { userId: string; name: string; email: string; role: "editor" | "viewer"; grantedAt: string; color: string };

const left = (iso: string) => {
  const ms = Date.parse(iso) - Date.now();
  const d = Math.floor(ms / 86_400_000);
  return d >= 1 ? `${d} day${d === 1 ? "" : "s"} left` : `${Math.max(1, Math.round(ms / 3_600_000))} h left`;
};

export function InviteDialog({ siteId, siteName, teamNote, onClose, toast }: { siteId: string; siteName: string; teamNote: string | null; onClose: () => void; toast: (t: string) => void }) {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState(5);
  const [url, setUrl] = useState<string | null>(null);
  const [list, setList] = useState<{ invites: Inv[]; people: Person[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  // Escape, the scrim and Close play the exit (scrim fades, panel shrinks to 96%) before the parent unmounts the dialog.
  const exit = useExit(onClose);
  const close = exit.close;

  const load = useCallback(async () => {
    try { setList(await api(`/api/collab/${siteId}/invites`)); } catch (e) { setErr((e as Error).message); }
  }, [siteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); first.current?.focus(); }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [close]);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>(`/api/collab/${siteId}/invites`, { method: "POST", body: JSON.stringify({ role, days, maxUses }) });
      setUrl(r.url);
      try { await navigator.clipboard.writeText(r.url); toast("Invite link copied."); } catch { /* the link is shown to copy by hand */ }
      void load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(q: string, what: string) {
    try { await api(`/api/collab/${siteId}/invites?${q}`, { method: "DELETE" }); toast(what); void load(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} {...exit.motion("fade")}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="inv-title" {...exit.motion("pop", false)} style={{ ["--m-origin" as string]: "50% 50%" }}>
        <div className={s.dialogHead}>
          <div className={s.grow}>
            <h2 id="inv-title">Invite to “{siteName}”</h2>
            <p className={s.dim} style={{ fontSize: "var(--t-small)", marginTop: 4 }}>Anyone with the link and a verified Keplar account joins this live session with the role you pick.</p>
          </div>
          <button type="button" className={s.quiet} onClick={close} aria-label="Close">Close</button>
        </div>

        <div className={s.row}>
          <div className={s.seg} role="group" aria-label="Role">
            <button ref={first} type="button" aria-pressed={role === "editor"} onClick={() => setRole("editor")}>Editor</button>
            <button type="button" aria-pressed={role === "viewer"} onClick={() => setRole("viewer")}>Viewer</button>
          </div>
          <span className={s.dim} style={{ fontSize: "var(--t-label)" }}>{role === "editor" ? "Types, runs commands, saves versions, splits off." : "Watches live: cursors, terminal, preview. Can't change anything."}</span>
        </div>
        <div className={s.row}>
          <label className={s.field}>Link works for
            <select className={s.select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label className={s.field}>People who can use it
            <select className={s.select} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
              {[1, 2, 5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className={s.grow} />
          <button type="button" className={s.primary} onClick={() => void create()} disabled={busy}>{busy ? "Creating…" : "Create link"}</button>
        </div>
        {url ? (
          <div className={s.copyBox}>
            <code>{url}</code>
            <button type="button" className={s.btn} onClick={() => { void navigator.clipboard.writeText(url).then(() => toast("Copied.")); }}>Copy</button>
          </div>
        ) : null}
        {teamNote ? <p className={s.dim} style={{ fontSize: "var(--t-label)" }}>{teamNote}</p> : null}
        {err ? <p role="alert" style={{ color: "var(--c-attention)", fontSize: "var(--t-small)" }}>{err}</p> : null}

        {list?.invites.length ? (
          <div>
            <h3 className={s.sectionTitle}>Open links</h3>
            <div className={s.list}>
              {list.invites.map((i) => (
                <div key={i.id} className={s.li}>
                  <span className={s.roleTag}>{i.role === "editor" ? "Editor" : "Viewer"}</span>
                  <span className={s.grow}>{i.uses}/{i.maxUses} used <span className={s.liMeta}>· {left(i.expiresAt)} · by {i.createdByName}</span></span>
                  <button type="button" className={s.quiet} onClick={() => void revoke(`invite=${i.id}`, "Link revoked. People who joined with it lost access.")}>Revoke</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {list?.people.length ? (
          <div>
            <h3 className={s.sectionTitle}>Invited people</h3>
            <div className={s.list}>
              {list.people.map((p) => (
                <div key={p.userId} className={s.li}>
                  <span className={s.avatar} style={{ background: p.color, marginLeft: 0, cursor: "default" }} aria-hidden="true">{initialsOf(p.name)}</span>
                  <span className={s.grow}>{p.name} <span className={s.liMeta}>· {p.email}</span></span>
                  <span className={s.roleTag}>{p.role === "editor" ? "Editor" : "Viewer"}</span>
                  <button type="button" className={s.quiet} onClick={() => void revoke(`user=${p.userId}`, `${p.name} no longer has access.`)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
