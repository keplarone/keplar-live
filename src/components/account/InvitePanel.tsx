"use client";

/** Account → Invite friends. Your personal link, what each side gets (extra usage credit only, never cash), the caps, and the outcome of each invite. */
import { useEffect, useRef, useState } from "react";
import s from "./account.module.css";

type Summary = {
  enabled: boolean; code: string; link: string; termsUrl: string;
  rewards: { referrerCredits: number; friendCredits: number; validDays: number };
  caps: { perMonth: number; lifetime: number };
  usage: { thisMonth: number; lifetime: number };
  creditsEarned: number;
  friends: { when: string; who: string; status: "rewarded" | "under review" | "no reward"; credits: number }[];
};

export function InvitePanel() {
  const [d, setD] = useState<Summary | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/referrals", { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? "Could not load your invite link."); return j as Summary; })
      .then((j) => on && setD(j))
      .catch((e: Error) => on && setErr(e.message));
    return () => { on = false; };
  }, []);

  if (err) return <p className={`${s.note} ${s.err}`} role="alert">{err}</p>;
  if (!d) return <p className={s.note}>Loading your invite link…</p>;

  const copy = async () => {
    setMsg("");
    try { await navigator.clipboard.writeText(d.link); setMsg("Link copied."); } catch { input.current?.select(); setMsg("Press Ctrl/⌘+C to copy the selected link."); }
  };
  const share = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const n = (x: number) => x.toLocaleString();
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className={s.panel} data-invite="">
      <p className={s.note}>
        Invite a friend. When they create a new account with your link and verify their email, <strong>you get {n(d.rewards.referrerCredits)} and they get {n(d.rewards.friendCredits)} extra usage credits</strong>.
        It is usage credit only, never cash, and it can&apos;t be withdrawn or transferred.
      </p>
      {!d.enabled ? <p className={`${s.note} ${s.err}`} role="status">Referral rewards are paused right now. Your link still works, but no credit is given until the program is back on.</p> : null}
      <label className={s.fieldLabel} htmlFor="invite-link">Your invite link</label>
      <input id="invite-link" ref={input} className={s.input} readOnly value={d.link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={copy}>Copy link</button>
        {share ? <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void navigator.share({ title: "Keplar", text: "Try Keplar: we both get extra usage credit.", url: d.link }).catch(() => undefined)}>Share…</button> : null}
        <span role="status" aria-live="polite" className={s.note}>{msg}</span>
      </div>
      <div className={s.row}><span className={s.k}>Rewarded friends</span><span className={s.v}>{d.usage.thisMonth} of {d.caps.perMonth} this month · {d.usage.lifetime} of {d.caps.lifetime} in total</span></div>
      <div className={s.row}><span className={s.k}>Credit earned</span><span className={s.v}>{n(d.creditsEarned)} credits<span className={s.sub}>Spent on a paid plan (Lite, Plus or Pro) once its own allowance runs out; they expire {d.rewards.validDays} days after they are granted. On Free they wait for you.</span></span></div>
      {d.friends.length ? (
        <ul className={s.sessions} aria-label="Your invites">
          {d.friends.map((f, i) => (
            <li key={i} className={s.session}>
              <span className={s.sessionInfo}>{f.who}<span className={s.sub}>{when(f.when)} · {f.status}{f.credits ? ` · +${n(f.credits)} credits` : ""}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className={s.note}>No one has joined with your link yet.</p>}
      <p className={s.note}>One reward per new account. Inviting yourself or using throwaway addresses earns nothing, and unusual sign-ups are checked by a person first. Read the <a className={s.link} href={d.termsUrl}>referral terms</a>.</p>
    </div>
  );
}
