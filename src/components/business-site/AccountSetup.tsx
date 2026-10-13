"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/business/account-fields";
import { BUSINESS_TIERS, listPriceFor, priceFor, usd, type SelfServeTier } from "@/lib/business/tiers";
import { WhopEmbed, type EmbedConfig } from "@/components/billing/WhopEmbed";
import { SignOutButton } from "./SignOutButton";
import { BusinessMark } from "./BusinessMark";
import s from "./business-site.module.css";

type Account = { company: string; website: string; size: string; industry: string; role: string };
type Phase = { at: "loading" } | { at: "profile"; account: Account | null; email: string | null; verified: boolean } | { at: "plan"; account: Account; active: boolean };

const TIERS: SelfServeTier[] = ["starter", "growth", "scale"];

function readChoice(): { tier: SelfServeTier } {
  const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tier");
  return { tier: t === "starter" || t === "scale" ? t : "growth" };
}

/**
 * business.keplar.one/account: create the business account (company profile) with the signed-in Keplar account, then choose
 * Starter, Growth or Scale and pay in Whop's embedded checkout on this page (the hosted Whop checkout is the fallback when the
 * embed can't load). Signed out, it sends the person to sign in and back here.
 */
export function AccountSetup() {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [choice, setChoice] = useState(readChoice);
  const [embed, setEmbed] = useState<{ tier: SelfServeTier; config: EmbedConfig; hosted: boolean } | null>(null);
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
          window.location.replace(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        setPhase(d.account ? { at: "plan", account: d.account, active: Boolean(d.active) } : { at: "profile", account: null, email: d.email ?? null, verified: Boolean(d.verified) });
      })
      .catch(() => { if (live) setMessage("Couldn't load your account. Refresh to try again."); });
    return () => { live = false; };
  }, []);

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

  const checkout = async (mode: "embed" | "hosted") => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/business/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier: choice.tier, mode }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && mode === "embed" && d.embed) { setEmbed({ tier: choice.tier, config: d.embed, hosted: Boolean(d.hosted) }); return; }
      if (res.ok && d.url) { window.location.assign(d.url); return; }
      setEmbed(null);
      setMessage(d.error ?? "Checkout couldn't start. Please try again.");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="Keplar Business home">
          <BusinessMark size={26} />
        </Link>
        <ol className={s.stepper} aria-label="Setup steps">
          <li aria-current={phase.at === "profile" ? "step" : undefined} data-done={phase.at === "plan" || undefined}>Business account</li>
          <li aria-current={phase.at === "plan" ? "step" : undefined}>Plan and checkout</li>
          <li>Download</li>
        </ol>
        {phase.at === "profile" || phase.at === "plan" ? <SignOutButton email={phase.at === "profile" ? phase.email : null} /> : <span />}
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
              <p className={s.muted}>Your plan is active. Open the workspace here, or get the desktop app.</p>
              <div className={s.heroActions}>
                <Link href="/work" className={s.btnPrimary}>Open workspace</Link>
                <Link href="/#download" className={s.btnGhost}>Get the desktop app</Link>
              </div>
            </>
          ) : embed ? (
            <>
              <h1 className={s.h2}>{BUSINESS_TIERS[embed.tier].name} for {phase.account.company}</h1>
              <p className={s.muted}>{usd(priceFor(embed.tier))} a month, plus any tax shown in the form. The exact amount is shown before you pay. Cancel any time from your account.</p>
              <div className={s.checkout}>
                <WhopEmbed
                  config={embed.config}
                  planName={BUSINESS_TIERS[embed.tier].name}
                  theme="dark"
                  // The webhook grants the plan; the storefront then shows it as active with the download.
                  onPaid={() => window.location.assign("/?purchased=1")}
                  onFallback={embed.hosted ? () => void checkout("hosted") : undefined}
                />
              </div>
              {message ? <p className={s.formError} role="alert">{message}</p> : null}
              <div className={s.heroActions}>
                <button type="button" className={s.btnGhost} onClick={() => setEmbed(null)}>Change plan</button>
              </div>
              <p className={s.muted}>Payment is handled by Whop inside the form above; Keplar never sees your card.</p>
            </>
          ) : (
            <>
              <h1 className={s.h2}>Choose a plan for {phase.account.company}</h1>
              <div className={s.choices} role="radiogroup" aria-label="Plan">
                {TIERS.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={choice.tier === t} className={s.choice} onClick={() => setChoice({ tier: t })}>
                    <strong>{BUSINESS_TIERS[t].name.replace("Keplar Business ", "")}</strong>
                    {listPriceFor(t) !== null ? <s className={s.priceWas}>{usd(listPriceFor(t)!)}</s> : null}
                    <span className={s.priceBig}>{usd(priceFor(t))}</span>
                    <span className={s.priceNote}>per month</span>
                    <span className={s.muted}>{BUSINESS_TIERS[t].seats} {BUSINESS_TIERS[t].seats === 1 ? "seat" : "seats"} · {BUSINESS_TIERS[t].activeAgents} agents · {BUSINESS_TIERS[t].credits!.toLocaleString("en-US")} credits</span>
                  </button>
                ))}
              </div>
              {message ? <p className={s.formError} role="alert">{message} <Link href="/#contact" className={s.textLink}>Contact sales</Link></p> : null}
              <div className={s.heroActions}>
                <button type="button" className={s.btnPrimary} onClick={() => void checkout("embed")} disabled={busy}>{busy ? "Opening checkout…" : "Continue to checkout"}</button>
                <Link href="/#contact" className={s.btnGhost}>Need Enterprise? Talk to sales</Link>
              </div>
              <p className={s.muted}>Payments are processed by Whop. Billed monthly. Cancel any time from your account; your plan runs to the end of the paid month.</p>
            </>
          )
        ) : null}
      </section>
    </div>
  );
}
