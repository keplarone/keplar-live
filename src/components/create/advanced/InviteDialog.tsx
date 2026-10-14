"use client";
/** Invite by link: pick a role (Editor or Viewer), how long the link works and how many people may use it. Revoke any time. */
import { useCallback, useEffect, useState } from "react";
import { Button, Dialog, SegmentedControl } from "@/components/kit";
import { api } from "../api";
import { initialsOf } from "@/lib/collab/roles";
import s from "./advanced.module.css";

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

  const load = useCallback(async () => {
    try { setList(await api(`/api/collab/${siteId}/invites`)); } catch (e) { setErr((e as Error).message); }
  }, [siteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, state is set after the awaited request
  useEffect(() => { void load(); }, [load]);

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={<>Invite to “{siteName}”</>} description="Anyone with the link and a verified Keplar account joins this live session with the role you pick." className={s.dialog}>
        <div className={s.row}>
          <SegmentedControl label="Role" size="sm" value={role} onValueChange={setRole} options={[{ value: "editor", label: "Editor" }, { value: "viewer", label: "Viewer" }]} />
          <span className={`${s.dim} ${s.note}`}>{role === "editor" ? "Types, runs commands, saves versions, splits off." : "Watches live: cursors, terminal, preview. Can't change anything."}</span>
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
          <Button variant="primary" size="sm" onClick={() => void create()} loading={busy}>{busy ? "Creating…" : "Create link"}</Button>
        </div>
        {url ? (
          <div className={s.copyBox}>
            <code>{url}</code>
            <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(url).then(() => toast("Copied.")); }}>Copy</Button>
          </div>
        ) : null}
        {teamNote ? <p className={`${s.dim} ${s.note}`}>{teamNote}</p> : null}
        {err ? <p role="alert" className={s.errText}>{err}</p> : null}

        {list?.invites.length ? (
          <div>
            <h3 className={s.sectionTitle}>Open links</h3>
            <div className={s.list}>
              {list.invites.map((i) => (
                <div key={i.id} className={s.li}>
                  <span className={s.roleTag}>{i.role === "editor" ? "Editor" : "Viewer"}</span>
                  <span className={s.grow}>{i.uses}/{i.maxUses} used <span className={s.liMeta}>· {left(i.expiresAt)} · by {i.createdByName}</span></span>
                  <Button variant="ghost" size="sm" onClick={() => void revoke(`invite=${i.id}`, "Link revoked. People who joined with it lost access.")}>Revoke</Button>
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
                  <Button variant="ghost" size="sm" onClick={() => void revoke(`user=${p.userId}`, `${p.name} no longer has access.`)}>Remove</Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
    </Dialog>
  );
}
