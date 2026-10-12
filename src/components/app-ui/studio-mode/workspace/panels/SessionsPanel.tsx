"use client";
/**
 * Saved sessions for the left nav: one chat per game (Roblox Studio place) or per .blend file (saved-session.ts). The chat
 * of the open place is restored by useStudioAgent when the place opens (device copy first, then the account's copy if it is
 * newer and the person has not acted since). This panel shows that session, starts a new one (a.reset: clears the device
 * and account copies), loads a newer account copy on request, and lists the other saved chats on this device and the
 * account, which open with their place; they can be deleted here.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Icon, IconButton } from "../../ui";
import { clearSaved, deleteRemote, fetchRemote, placeKey, writeSaved } from "../../saved-session";
import type { StudioAgent } from "../../useStudioAgent";
import { accountIsNewer, deviceSessions, mergeSessions, savedWhen, whereSaved, type SessionEntry } from "./panel-logic";
import s from "./panels.module.css";

const SHOWN = 12;
type AccountRow = { key: string; name: string; savedAt: number };

export type SessionsPanelProps = { a: StudioAgent; env: "roblox" | "blender"; compact?: boolean };

function readDevice(env: "roblox" | "blender"): SessionEntry[] {
  try { return deviceSessions(window.localStorage, env); } catch { return []; }
}

export function SessionsPanel({ a, env, compact = false }: SessionsPanelProps) {
  const [device, setDevice] = useState<SessionEntry[]>([]);
  const [account, setAccount] = useState<AccountRow[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const loadAccount = useCallback(async () => {
    try {
      const r = await fetch("/api/studio/chats", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return; // signed out or offline: the device copies still show
      const d = (await r.json()) as { chats?: AccountRow[] };
      setAccount(Array.isArray(d.chats) ? d.chats : []);
    } catch { /* offline */ }
  }, []);

  // Device copies: re-read shortly after the hook's autosave (400 ms; 3 s while running), and when another window writes.
  const itemCount = a.items.length;
  useEffect(() => {
    const t = window.setTimeout(() => { setDevice(readDevice(env)); setNow(Date.now()); }, a.running ? 3500 : 700);
    return () => window.clearTimeout(t);
  }, [env, itemCount, a.running, a.place]);
  useEffect(() => {
    const on = (e: StorageEvent) => { if (!e.key || e.key.startsWith("keplar-studio-chat:")) setDevice(readDevice(env)); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [env]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch("/api/studio/chats", { cache: "no-store", credentials: "same-origin" });
        if (!r.ok || !live) return;
        const d = (await r.json()) as { chats?: AccountRow[] };
        if (live) setAccount(Array.isArray(d.chats) ? d.chats : []);
      } catch { /* offline */ }
    })();
    return () => { live = false; };
  }, [a.place]);

  const currentKey = placeKey(a.place);
  const entries = mergeSessions(device, account, env);
  const current = entries.find((e) => e.key === currentKey);
  const others = entries.filter((e) => e.key !== currentKey);
  const shown = all ? others : others.slice(0, SHOWN);
  const thing = env === "blender" ? "file" : "place";

  const newSession = () => { setConfirm(null); a.reset(); setAccount((xs) => xs.filter((x) => x.key !== currentKey)); window.setTimeout(() => setDevice(readDevice(env)), 50); };

  const loadNewer = async () => {
    if (!currentKey || !a.place) return;
    setLoading(true); setError("");
    try {
      const remote = await fetchRemote(currentKey);
      if (!remote) { setError("The account copy could not be loaded."); return; }
      writeSaved(currentKey, remote);
      const place = a.place;
      a.setPlace(null);
      a.setPlace(place);
      setDevice(readDevice(env));
    } finally { setLoading(false); }
  };

  const remove = async (key: string) => {
    setConfirm(null);
    clearSaved(key);
    setDevice((xs) => xs.filter((x) => x.key !== key));
    setAccount((xs) => xs.filter((x) => x.key !== key));
    await deleteRemote(key);
    void loadAccount();
  };

  return (
    <div className={s.stack} data-compact={compact ? "" : undefined} data-sessions="">
      <div className={s.current} aria-label={`This ${thing}`} role="group">
        <p className={s.currentName} title={a.place?.name}>{a.place?.name ?? (env === "blender" ? "No file open" : "No place open")}</p>
        <p className={s.meta}>
          {a.items.length ? `${a.items.length} message${a.items.length === 1 ? "" : "s"} · ${a.units.toLocaleString()} credits` : "No messages yet"}
          {current ? ` · saved ${savedWhen(current.savedAt, now)}` : ""}
        </p>
        {confirm === "new" ? (
          <div className={s.confirm} role="group" aria-label="Start a new session">
            <p className={s.meta}>Clears this {thing}&apos;s chat on this device and your account.</p>
            <div className={s.row}>
              <Button size="sm" variant="danger" onClick={newSession}>Clear and start new</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className={s.row}>
            <Button size="sm" leadingIcon={<Icon name="plus" size={14} />} disabled={a.running || !a.items.length} title={a.running ? "Finish or stop this build first" : undefined} onClick={() => setConfirm("new")}>
              New session
            </Button>
            {accountIsNewer(current) ? (
              <Button size="sm" variant="ghost" loading={loading} disabled={a.running || loading} leadingIcon={<Icon name="history" size={14} />} onClick={() => void loadNewer()}>Load newer copy</Button>
            ) : null}
          </div>
        )}
        {accountIsNewer(current) && confirm !== "new" ? <p className={s.meta}>Your account has a newer save from {current?.account ? savedWhen(current.account.savedAt, now) : ""}.</p> : null}
        {error ? <p className={s.notice} data-tone="danger" role="alert"><Icon name="error" size={14} />{error}</p> : null}
      </div>

      {others.length ? (
        <div className={s.field}>
          <p className={s.meta}>Other saved chats open with their {thing}.</p>
          <ul className={s.list} aria-label="Saved chats">
            {shown.map((e) => (
              <li key={e.key} className={s.session}>
                <span className={s.sessionName} title={e.name}>{e.name}</span>
                <span className={s.sessionMeta}>{savedWhen(e.savedAt, now)} · {whereSaved(e)}{e.device ? ` · ${e.device.items} msg` : ""}</span>
                <span className={s.sessionActions}>
                  {confirm === e.key ? null : <IconButton size="sm" label={`Delete the saved chat for ${e.name}`} icon={<Icon name="trash" size={14} />} onClick={() => setConfirm(e.key)} />}
                </span>
                {confirm === e.key ? (
                  <div className={s.confirm} role="group" aria-label={`Delete ${e.name}`}>
                    <p className={s.meta}>Delete this chat from {e.device && e.account ? "this device and your account" : e.device ? "this device" : "your account"}?</p>
                    <div className={s.row}>
                      <Button size="sm" variant="danger" onClick={() => void remove(e.key)}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {others.length > SHOWN ? <span><Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${others.length}`}</Button></span> : null}
        </div>
      ) : null}
    </div>
  );
}
