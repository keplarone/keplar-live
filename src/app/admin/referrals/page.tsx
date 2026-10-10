import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { adminReport } from "@/lib/referrals/repo";
import { ReferralActions } from "@/components/admin/ReferralActions";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

/** Referral program: settings in force, today's cap use, every claim with the rule that held or blocked it, and approve/deny for held ones. Real counts only. */
export default async function AdminReferralsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const r = await adminReport();
  const c = r.config;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · Referrals</p>
        <h1>Referral rewards</h1>
        <p className={s.sub}>
          Rewards are extra usage credit only (never cash): {c.referrerCredits.toLocaleString()} for the referrer and {c.friendCredits.toLocaleString()} for the friend, valid {c.validDays} days.
          Caps: {c.perMonth} a month and {c.lifetime} in total per referrer, {c.dailyProgramCap} a day for the whole program. The program is {c.enabled ? "on" : "OFF (KEPLAR_REFERRALS=off)"}.
          Values come from the environment (see docs/referrals.md).
        </p>
      </header>

      <section className={s.panel} aria-labelledby="ref-totals">
        <h2 id="ref-totals">Totals</h2>
        <div className={s.grid}>
          {[
            ["Claims", r.totals.all], ["Rewarded", r.totals.granted + r.totals.approved], ["Waiting for review", r.totals.held], ["Capped", r.totals.capped],
            ["Blocked", r.totals.blocked], ["Denied", r.totals.denied], ["Credits granted", r.totals.creditsGranted], ["Rewards today", `${r.today.granted} of ${r.today.cap}`],
          ].map(([k, v]) => (
            <div key={String(k)} className={s.stat}><span>{k}</span><strong>{typeof v === "number" ? v.toLocaleString() : v}</strong></div>
          ))}
        </div>
        <p className={s.sub}>Credits granted counts both sides. At $0.002 of model cost per credit that is at most ${(r.totals.creditsGranted * 0.002).toFixed(2)} of provider cost, before any is actually spent (unspent credits expire).</p>
      </section>

      <section className={s.panel} aria-labelledby="ref-claims">
        <h2 id="ref-claims">Claims (newest first)</h2>
        {r.claims.length === 0 ? (
          <p className={s.empty}>No one has used an invite link yet.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr>{["When", "Friend", "Referrer code", "Status", "Why", "Credits (referrer / friend)", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {r.claims.map((x) => (
                  <tr key={x.id}>
                    <td>{new Date(x.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                    <td>{x.maskedEmail}</td>
                    <td>{x.referrerCode}</td>
                    <td>{x.status}</td>
                    <td>{x.reasons.join("; ") || "—"}</td>
                    <td>{x.referrerCredits} / {x.friendCredits}</td>
                    <td>{x.status === "held" ? <ReferralActions id={x.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.sub}>Network, browser and mailbox fingerprints are one-way hashes and are not shown here. A hold is not a verdict: shared home or office networks and company domains are held for a look, not refused.</p>
      </section>

      <section className={s.panel} aria-labelledby="ref-top">
        <h2 id="ref-top">Busiest referrers</h2>
        {r.topReferrers.length === 0 ? <p className={s.empty}>None yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr>{["Code", "Rewarded", "Held", "Blocked"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{r.topReferrers.map((t) => <tr key={t.referrerWs}><td>{t.code}</td><td>{t.rewarded}</td><td>{t.held}</td><td>{t.blocked}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
