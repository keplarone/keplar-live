"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/business/account-fields";
import { BUSINESS_TIERS, type BillingCycle, type SelfServeTier } from "@/lib/business/tiers";
import s from "./business-site.module.css";

type Account = { company: string; website: string; size: string; industry: string; role: string };
type Phase = { at: "loading" } | { at: "profile"; account: Account | null; email: string | null; verified: boolean } | { at: "plan"; account: Account; active: boolean };

const STORE = "https://business.keplar.one";
const TIERS: SelfServeTier[] = ["starter", "growth", "scale"];

function readChoice(): { tier: SelfServeTier; cycle: BillingCycle } {
  const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const t = q?.get("tier");
  const c = q?.get("cycle");
  return { tier: t === "starter" || t === "scale" ? t : "growth", cycle: c === "annual" ? "annual" : "monthly" };
}

/**
 * keplar.one/business-account: create the business account (company profile) with the signed-in Keplar account, then choose
 * Starter, Growth or Scale and go to checkout. Signed out, it sends the person to sign in and back here.
 */
export function AccountSetup({ discountPct }: { discountPct: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [choice, setChoice] = useState(readChoice);
  const [errors, setErrors] = useState<Partial<Record<keyof Account, string>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/business/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (!d.signedIn) {
          router.replace(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        setPhase(d.account ? { at: "plan", account: d.account, active: Boolean(d.active) } : { at: "profile", account: null, email: d.email ?? null, verified: Boolean(d.verified) });
      })
      .catch(() => { if (live) setMessage("Couldn't load your account. Refresh to try again."); });
    return () => { live = false; };
  }, [router]);

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      const res = await fetch("/api/business/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(f.entries())) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(d.fields ?? {}); setMessage(d.error ?? "That didn't save. Please try again."); return; }
      setPhase({ at: "plan", account: d.account, active: false });
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/business/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(choice) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { window.location.assign(d.url); return; }
      setMessage(d.error ?? "Checkout couldn't start. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const yearly = (t: SelfServeTier) => Math.round(BUSINESS_TIERS[t].monthly! * 12 * (1 - discountPct / 100));

  return (
    <div className={s.page}>
      <header className={s.nav}>
        <a href={STORE} className={s.brand}>
          <svg viewBox="0 0 398 398" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="229" height="229" rx="70" /><path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" /><circle cx="281" cy="281" r="117" /></svg>
          Keplar Business
        </a>
        <ol className={s.stepper} aria-label="Setup steps">
          <li aria-current={phase.at === "profile" ? "step" : undefined} data-done={phase.at === "plan" || undefined}>Business account</li>
          <li aria-current={phase.at === "plan" ? "step" : undefined}>Plan and checkout</li>
          <li>Download</li>
        </ol>
        <span />
      </header>

      <section className={s.setup}>
        {phase.at === "loading" ? <span className={s.skeleton} aria-label="Loading" /> : null}

        {phase.at === "profile" ? (
          <>
            <h1 className={s.h2}>Create your business account</h1>
            <p className={s.muted}>It uses your Keplar account{phase.email ? ` (${phase.email})` : ""}. You can add teammates after you choose a plan.</p>
            {!phase.verified ? <p className={s.notice} role="status">Verify your email address first: check your inbox for the link from Keplar, then refresh this page.</p> : null}
            <form className={s.form} onSubmit={(e) => void saveProfile(e)} noValidate>
              <label className={s.field}><span>Company name</span><input name="company" required autoComplete="organization" aria-invalid={Boolean(errors.company) || undefined} />{errors.company ? <em>{errors.company}</em> : null}</label>
              <label className={s.field}><span>Website <small>(optional)</small></span><input name="website" inputMode="url" placeholder="example.com" aria-invalid={Boolean(errors.website) || undefined} />{errors.website ? <em>{errors.website}</em> : null}</label>
              <label className={s.field}><span>Company size</span><select name="size" defaultValue="" aria-invalid={Boolean(errors.size) || undefined}><option value="">Choose…</option>{COMPANY_SIZES.map((x) => <option key={x}>{x}</option>)}</select>{errors.size ? <em>{errors.size}</em> : null}</label>
              <label className={s.field}><span>Industry</span><select name="industry" defaultValue="" aria-invalid={Boolean(errors.industry) || undefined}><option value="">Choose…</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select>{errors.industry ? <em>{errors.industry}</em> : null}</label>
              <label className={`${s.field} ${s.wide}`}><span>Your role</span><input name="role" required autoComplete="organization-title" placeholder="Founder, Head of Operations…" aria-invalid={Boolean(errors.role) || undefined} />{errors.role ? <em>{errors.role}</em> : null}</label>
              {message ? <p className={`${s.formError} ${s.wide}`} role="alert">{message}</p> : null}
              <div className={s.wide}><button type="submit" className={s.btnPrimary} disabled={busy || !phase.verified}>{busy ? "Saving…" : "Create business account"}</button></div>
            </form>
          </>
        ) : null}

        {phase.at === "plan" ? (
          phase.active ? (
            <>
              <h1 className={s.h2}>{phase.account.company} is on Keplar Business</h1>
              <p className={s.muted}>Your plan is active. Download the desktop app from the Business site.</p>
              <a href={`${STORE}/#download`} className={s.btnPrimary}>Go to download</a>
            </>
          ) : (
            <>
              <h1 className={s.h2}>Choose a plan for {phase.account.company}</h1>
              <div className={s.toggle} role="radiogroup" aria-label="Billing period">
                <button type="button" role="radio" aria-checked={choice.cycle === "monthly"} onClick={() => setChoice((c) => ({ ...c, cycle: "monthly" }))}>Monthly</button>
                <button type="button" role="radio" aria-checked={choice.cycle === "annual"} onClick={() => setChoice((c) => ({ ...c, cycle: "annual" }))}>Annual <span className={s.save}>save {discountPct}%</span></button>
              </div>
              <div className={s.choices} role="radiogroup" aria-label="Plan">
                {TIERS.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={choice.tier === t} className={s.choice} onClick={() => setChoice((c) => ({ ...c, tier: t }))}>
                    <strong>{BUSINESS_TIERS[t].name.replace("Keplar Business ", "")}</strong>
                    <span className={s.priceBig}>${choice.cycle === "monthly" ? BUSINESS_TIERS[t].monthly!.toLocaleString("en-US") : yearly(t).toLocaleString("en-US")}</span>
                    <span className={s.priceNote}>{choice.cycle === "monthly" ? "per month" : "per year"}</span>
                    <span className={s.muted}>{BUSINESS_TIERS[t].seats} {BUSINESS_TIERS[t].seats === 1 ? "seat" : "seats"} · {BUSINESS_TIERS[t].activeAgents} agents · {BUSINESS_TIERS[t].credits!.toLocaleString("en-US")} credits</span>
                  </button>
                ))}
              </div>
              {message ? <p className={s.formError} role="alert">{message} <a href={`${STORE}/#contact`} className={s.textLink}>Contact sales</a></p> : null}
              <div className={s.heroActions}>
                <button type="button" className={s.btnPrimary} onClick={() => void checkout()} disabled={busy}>{busy ? "Opening checkout…" : "Continue to checkout"}</button>
                <a href={`${STORE}/#contact`} className={s.btnGhost}>Need Enterprise? Talk to sales</a>
              </div>
              <p className={s.muted}>Payments are processed by Whop. Cancel any time from your account; annual plans run to the end of the paid year.</p>
            </>
          )
        ) : null}
      </section>
    </div>
  );
}
