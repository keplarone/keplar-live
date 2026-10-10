"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addAccount, fetchAccounts, removeSavedAccount, signInAgainTarget, signOutAll, signOutCurrent, switchToAccount, type SavedAccount } from "@/components/account/switch-account";
import s from "./AccountMenu.module.css";
import { usePresence } from "@/components/motion/usePresence";
import { ThemeControl } from "@/components/theme/ThemeControl";

import type { AccountInfo } from "./state/types";

const initial = (a: AccountInfo) => ((a.name || a.email || "?").trim()[0] ?? "?");

/**
 * The signed-in account in the sidebar (a compact row: avatar, name, plan). The menu holds usage, Settings, plan, language, help and
 * the theme, then who you are, the other accounts signed in on this device (one click to switch, no
 * re-login; an account whose session ended says so and offers "Sign in again"), "Add account" (sign in as another account
 * without signing out), "Sign out" (this account only) and "Sign out of all". Only the active account's data is ever on screen:
 * a switch wipes the account caches and reloads, and each account's sessions are checked on the server.
 */
export function AccountMenu({ account, plan, paid = false, usage }: { account: AccountInfo; /** Plan name shown under the name (e.g. "Free", "Keplar Plus"). */ plan?: string; paid?: boolean; /** The usage readout (meter, notes, limits); shown at the top of the menu. */ usage?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string; role: string }[]>([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menu = usePresence(open); // pops up out of the chip, and back into it on close

  // Team workspaces (beta): which teams this person is in and which one the app is working in. Quiet when there are none.
  useEffect(() => {
    let live = true;
    void fetch("/api/team", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { teams?: { id: string; name: string; role: string }[]; active?: string | null } | null) => { if (live && j) { setTeams(j.teams ?? []); setActiveTeam(j.active ?? null); } })
      .catch(() => undefined);
    return () => { live = false; };
  }, [account.email]);
  const switchWorkspace = (teamId: string | null) => run(async () => {
    const r = await fetch("/api/team/active", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ teamId }) });
    if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; setProblem(j.error ?? "Couldn't switch workspace."); return; }
    window.location.reload(); // every list on screen belongs to one workspace; start clean in the other
  });
  const activeName = teams.find((t) => t.id === activeTeam)?.name ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const load = async () => { const l = await fetchAccounts(); if (l) setSaved(l.accounts); };
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchAccounts().then((l) => { if (live && l) setSaved(l.accounts); });
    return () => { live = false; };
  }, [open]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const switchTo = (a: SavedAccount) => run(async () => {
    const r = await switchToAccount(a.slot);
    if (!r.ok) { setProblem(r.message); await load(); }
  });

  return (
    <div className={s.wrap} ref={ref} data-account-menu="">
      <button type="button" className={s.chip} aria-haspopup="menu" aria-expanded={open} onClick={() => { setProblem(null); setOpen((v) => !v); }} aria-label={`Account: ${account.email ?? account.name ?? "signed in"}`}>
        <span className={s.avatar} aria-hidden="true">{initial(account)}</span>
        <span className={s.who}>
          <span className={s.name}>{account.name || account.email?.split("@")[0] || "Account"}</span>
          {activeName ? <span className={s.email} data-team-active="">Team: {activeName}</span> : plan ? <span className={s.email} data-plan-name="">{plan}</span> : account.email ? <span className={s.email}>{account.email}</span> : null}
        </span>
        <span className={s.caret} aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
      {menu.mounted ? (
        <div className={s.menu} role="menu" aria-label="Account" {...menu.motion("pop")} style={{ ["--m-origin" as string]: "50% 100%" }}>
          <div className={s.menuHead}>
            <span className={s.menuLabel}>Signed in as</span>
            <span className={s.name}>{account.email ?? account.name}</span>
          </div>
          {usage ? <div className={s.usage}>{usage}</div> : null}
          {saved.length ? (
            <div className={s.list} role="group" aria-label="Other accounts on this device">
              {saved.map((a) => (
                <div key={a.slot} className={s.acctRow} data-saved-account={a.email} data-expired={a.expired || undefined}>
                  {a.expired ? (
                    <a role="menuitem" className={s.item} href={signInAgainTarget(a.email)} data-account-action="signin-again">
                      <span className={s.avatar} aria-hidden="true">{(a.name || a.email)[0]}</span>
                      <span className={s.who}><span className={s.name}>{a.email}</span><span className={s.email}>Signed out · Sign in again</span></span>
                    </a>
                  ) : (
                    <button type="button" role="menuitem" className={s.item} disabled={busy} data-account-action="switch" onClick={() => void switchTo(a)}>
                      <span className={s.avatar} aria-hidden="true">{(a.name || a.email)[0]}</span>
                      <span className={s.who}><span className={s.name}>{a.name || a.email.split("@")[0]}</span><span className={s.email}>{a.email}</span></span>
                    </button>
                  )}
                  {a.expired ? <button type="button" className={s.rm} disabled={busy} aria-label={`Remove ${a.email} from this device`} data-account-action="remove" onClick={() => void run(async () => { await removeSavedAccount(a.slot); await load(); })}>Remove</button> : null}
                </div>
              ))}
            </div>
          ) : null}
          {teams.length ? (
            <div className={s.list} role="group" aria-label="Workspace" data-workspace-switcher="">
              <span className={s.menuLabel}>Workspace</span>
              <button type="button" role="menuitemradio" aria-checked={!activeTeam} className={s.item} disabled={busy || !activeTeam} data-workspace="personal" onClick={() => void switchWorkspace(null)}>Personal{!activeTeam ? <span className={s.email}>current</span> : null}</button>
              {teams.map((t) => (
                <button key={t.id} type="button" role="menuitemradio" aria-checked={t.id === activeTeam} className={s.item} disabled={busy || t.id === activeTeam} data-workspace={t.id} onClick={() => void switchWorkspace(t.id)}>{t.name} <span className={s.email}>{t.role === "member" ? "editor" : t.role}</span></button>
              ))}
              <Link role="menuitem" className={s.item} href="/account#team" data-workspace-manage="">Manage teams</Link>
            </div>
          ) : null}
          <div className={s.list} role="group" aria-label="Account">
            <Link role="menuitem" className={s.item} href="/account">Settings</Link>
            <a role="menuitem" className={s.item} href={paid ? "/account#plan" : "/pricing"} data-plan-cta="change">{paid ? "Plan & billing" : "Upgrade plan"}</a>
            <Link role="menuitem" className={s.item} href="/account#language">Language</Link>
            <Link role="menuitem" className={s.item} href="/docs">Help &amp; docs</Link>
            <div className={s.themeRow} data-theme-row="">
              <span>Theme</span>
              <ThemeControl compact />
            </div>
          </div>
          {problem ? <p className={s.note} role="alert">{problem}</p> : null}
          <button type="button" role="menuitem" className={s.item} disabled={busy} data-account-action="add" onClick={() => addAccount()}>Add account</button>
          <button type="button" role="menuitem" className={s.item} disabled={busy} data-account-action="signout" onClick={() => void run(async () => { await signOutCurrent(); })}>Sign out</button>
          {saved.length ? <button type="button" role="menuitem" className={s.item} disabled={busy} data-account-action="signout-all" onClick={() => void run(signOutAll)}>Sign out of all accounts</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export type ImportOffer = { count: number; busy: boolean; note: string | null; onImport: () => void; onDecline: () => void };

/** Asked once per account, only when this device holds chats made before signing in. Nothing moves unless the user agrees. */
export function ImportPrompt({ offer }: { offer: ImportOffer }) {
  return (
    <div className={s.import} role="region" aria-label="Import chats from this device" data-import-prompt="">
      <span className={s.importTitle}>Import chats from this device?</span>
      <span className={s.importBody}>{offer.count} chat{offer.count === 1 ? "" : "s"} on this device {offer.count === 1 ? "was" : "were"} made before you signed in. Importing saves {offer.count === 1 ? "it" : "them"} to this account and removes {offer.count === 1 ? "it" : "them"} from this device.</span>
      {offer.note ? <span className={s.importBody} role="status">{offer.note}</span> : null}
      <div className={s.row}>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={offer.busy} onClick={offer.onImport}>{offer.busy ? "Importing…" : "Import"}</button>
        <button type="button" className={s.btn} disabled={offer.busy} onClick={offer.onDecline}>Not now</button>
      </div>
    </div>
  );
}
