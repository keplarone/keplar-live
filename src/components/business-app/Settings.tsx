"use client";
/**
 * Keplar Business settings, laid out like Claude's: a section bar on the left and one section at a time on the right.
 * Everything here works against real endpoints: the business profile saves through /api/business/account, usage comes from
 * /api/business/dashboard, "Manage subscription" opens Whop's own page (/api/billing/portal), the export downloads the
 * account's data (/api/account/export), and sign-out revokes this device's Business sessions. Two-factor, passkeys, sessions
 * and account deletion belong to the one Keplar account, so those link to it. Preferences are per device (localStorage).
 */
import { useEffect, useState } from "react";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/business/account-fields";
import { siteUrl } from "@/lib/site";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "@/components/business-site/sign-out";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";
import s from "./workspace.module.css";


type Profile = { company: string; website: string; size: string; industry: string; role: string };
type Account = {
  signedIn: boolean; email?: string | null; account?: Profile | null; active?: boolean; plan?: { tier: string | null; name: string } | null;
  download?: { version: string; files: { os: string; arch: string; type: string; url: string; size: number }[]; notesUrl: string } | null;
};
type Dash = { entitlements?: { label: string }; compute?: { used: number; total: number | null } };

const SIDE_KEY = "keplar-biz-side";
const LIVE_CODE_KEY = "kc-live-code";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const mb = (n: number) => `${(n / 1_048_576).toFixed(0)} MB`;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={s.setRow}>
      <div><div className={s.setLabel}>{label}</div>{hint ? <p className={s.muted}>{hint}</p> : null}</div>
      <div className={s.setControl}>{children}</div>
    </div>
  );
}

export function Settings({ section, onSection }: { section: SettingsSection; onSection: (s: SettingsSection) => void }) {
  const [acct, setAcct] = useState<Account | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [form, setForm] = useState<Profile | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Profile, string>>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [sideClosed, setSideClosed] = useState(() => read(SIDE_KEY) === "closed");
  const [liveCode, setLiveCode] = useState(() => read(LIVE_CODE_KEY) !== "hidden");

  useEffect(() => {
    let live = true;
    fetch("/api/business/account", { cache: "no-store" }).then((r) => r.json()).then((d: Account) => {
      if (!live) return;
      setAcct(d);
      setForm(d.account ? { company: d.account.company ?? "", website: d.account.website ?? "", size: d.account.size ?? "", industry: d.account.industry ?? "", role: d.account.role ?? "" } : { company: "", website: "", size: "", industry: "", role: "" });
    }).catch(() => live && setAcct({ signedIn: false }));
    fetch("/api/business/dashboard", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: Dash | null) => live && setDash(d)).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const say = (m: string) => { setMsg(m); window.setTimeout(() => setMsg((cur) => (cur === m ? "" : cur)), 4000); };

  const saveProfile = async () => {
    if (!form) return;
    setBusy("profile");
    setErrors({});
    try {
      const res = await fetch("/api/business/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(d.fields ?? {}); say(d.error ?? "That didn't save. Try again."); return; }
      setAcct((a) => (a ? { ...a, account: d.account } : a));
      say("Saved.");
    } finally { setBusy(""); }
  };

  const manage = async () => {
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { window.open(d.url, "_blank", "noopener"); return; }
      say(d.error ?? "Couldn't open the subscription page. Try again.");
    } finally { setBusy(""); }
  };

  const used = dash?.compute?.used ?? null;
  const total = dash?.compute?.total ?? null;
  const pct = used !== null && total ? Math.min(100, Math.round((used / total) * 100)) : null;
  const field = (k: keyof Profile) => ({ value: form?.[k] ?? "", "aria-invalid": Boolean(errors[k]) || undefined, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f)) });

  return (
    <div className={s.settings}>
      <nav className={s.setNav} aria-label="Settings">
        <div className={s.setNavHead}>Settings</div>
        {SETTINGS_SECTIONS.map((x) => (
          <button key={x.id} type="button" className={s.setNavItem} aria-current={section === x.id ? "page" : undefined} onClick={() => onSection(x.id)}>{x.label}</button>
        ))}
      </nav>

      <div className={s.setBody}>
        <h1 className={s.h1}>{SETTINGS_SECTIONS.find((x) => x.id === section)?.label}</h1>
        {msg ? <p className={s.setToast} role="status">{msg}</p> : null}
        {!acct ? <span className={s.spinner} aria-label="Loading" /> : null}

        {acct && section === "general" ? (
          <>
            <section className={s.setGroup}>
              <Row label="Email" hint="Your Keplar account. One account signs in to Keplar One and Keplar Business."><span className={s.setValue}>{acct.email ?? "—"}</span></Row>
            </section>
            <section className={s.setGroup} aria-label="Business profile">
              <div className={s.setGroupHead}>Business profile</div>
              <Row label="Company">{<><input className={s.setInput} autoComplete="organization" {...field("company")} />{errors.company ? <em className={s.setErr}>{errors.company}</em> : null}</>}</Row>
              <Row label="Website" hint="Optional.">{<><input className={s.setInput} inputMode="url" placeholder="example.com" {...field("website")} />{errors.website ? <em className={s.setErr}>{errors.website}</em> : null}</>}</Row>
              <Row label="Company size">{<><select className={s.setInput} {...field("size")}><option value="">Choose…</option>{COMPANY_SIZES.map((x) => <option key={x}>{x}</option>)}</select>{errors.size ? <em className={s.setErr}>{errors.size}</em> : null}</>}</Row>
              <Row label="Industry">{<><select className={s.setInput} {...field("industry")}><option value="">Choose…</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select>{errors.industry ? <em className={s.setErr}>{errors.industry}</em> : null}</>}</Row>
              <Row label="Your role">{<><input className={s.setInput} autoComplete="organization-title" {...field("role")} />{errors.role ? <em className={s.setErr}>{errors.role}</em> : null}</>}</Row>
              <div className={s.setActions}><button type="button" className={s.btnPrimary} onClick={() => void saveProfile()} disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save profile"}</button></div>
            </section>
          </>
        ) : null}

        {acct && section === "plan" ? (
          <>
            <section className={s.setGroup}>
              <Row label="Plan"><span className={s.setValue}>{acct.plan?.name ?? (acct.active ? "Keplar Business" : "No Business plan")}</span></Row>
              <Row label="Usage this period" hint="Credits are shared across Keplar; one credit is $0.002 of model cost.">
                {used !== null ? (
                  <div className={s.setMeter}>
                    <span>{used.toLocaleString()}{total ? ` / ${total.toLocaleString()}` : ""} credits</span>
                    {pct !== null ? <span className={s.setBar} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Credits used"><i style={{ width: `${pct}%` }} /></span> : null}
                  </div>
                ) : <span className={s.muted}>Usage is not available right now.</span>}
              </Row>
            </section>
            <div className={s.setActions}>
              <button type="button" className={s.btnPrimary} onClick={() => void manage()} disabled={busy === "portal"}>{busy === "portal" ? "Opening…" : "Manage subscription"}</button>
              <a className={s.btnGhost} href="/#pricing" target="_blank" rel="noopener">Compare plans</a>
            </div>
            <p className={s.muted}>Subscriptions are billed and managed by Whop. Cancel any time; the plan runs to the end of the paid month.</p>
          </>
        ) : null}

        {acct && section === "preferences" ? (
          <section className={s.setGroup}>
            <p className={s.muted}>Saved on this device.</p>
            <Row label="Start with the sidebar collapsed">
              <input type="checkbox" role="switch" className={s.setSwitch} checked={sideClosed} onChange={(e) => { setSideClosed(e.target.checked); write(SIDE_KEY, e.target.checked ? "closed" : "open"); say("Applies the next time the workspace opens."); }} aria-label="Start with the sidebar collapsed" />
            </Row>
            <Row label="Show code while Create builds" hint="The live code panel with the build's tasks, files and log.">
              <input type="checkbox" role="switch" className={s.setSwitch} checked={liveCode} onChange={(e) => { setLiveCode(e.target.checked); write(LIVE_CODE_KEY, e.target.checked ? "shown" : "hidden"); }} aria-label="Show code while Create builds" />
            </Row>
            <Row label="Theme" hint="Keplar Business is always dark."><span className={s.setValue}>Dark</span></Row>
          </section>
        ) : null}

        {acct && section === "security" ? (
          <>
            <section className={s.setGroup}>
              <Row label="Two-factor and passkeys" hint="Set on your Keplar account; they protect Keplar Business sign-ins too."><a className={s.btnGhost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Open account security</a></Row>
              <Row label="Signed-in devices" hint="See and end sessions on your Keplar account."><a className={s.btnGhost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Manage devices</a></Row>
              <Row label="This device" hint="Ends every Keplar Business session here. Keplar One stays signed in.">
                <button type="button" className={s.btnGhost} disabled={busy === "signout"} onClick={async () => { setBusy("signout"); if (!(await signOutOfBusiness())) { setBusy(""); say(SIGN_OUT_FAILED); } }}>{busy === "signout" ? "Signing out…" : "Sign out"}</button>
              </Row>
            </section>
          </>
        ) : null}

        {acct && section === "privacy" ? (
          <section className={s.setGroup}>
            <Row label="Export your data" hint="Everything your account owns, as JSON, with secrets redacted."><a className={s.btnGhost} href="/api/account/export" download>Download export</a></Row>
            <Row label="Delete your account" hint="Deletes the Keplar account and its Business data after a 14-day grace period. Payment records the law requires are kept."><a className={s.btnGhost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Open account settings</a></Row>
            <Row label="Model training" hint="Paid plans, Business included, send requests only to model endpoints that say they do not train on prompts."><a className={s.textLink} href={`${siteUrl}/privacy`} target="_blank" rel="noopener">Privacy policy</a></Row>
          </section>
        ) : null}

        {acct && section === "desktop" ? (
          <section className={s.setGroup}>
            {acct.download ? (
              <>
                <Row label="Latest version"><span className={s.setValue}>{acct.download.version}</span></Row>
                {acct.download.files.map((f) => (
                  <Row key={f.url} label={`${f.os === "macos" ? "macOS" : f.os === "windows" ? "Windows" : "Linux"} · ${f.arch}`} hint={`.${f.type} · ${mb(f.size)}`}><a className={s.btnGhost} href={f.url}>Download</a></Row>
                ))}
                <Row label="Release notes"><a className={s.textLink} href={acct.download.notesUrl} target="_blank" rel="noopener">What changed</a></Row>
                <p className={s.muted}>The desktop app updates itself. Installers are not yet code-signed, so Windows and macOS show a warning the first time.</p>
              </>
            ) : <p className={s.muted}>Downloads appear here once your Business plan is active.</p>}
          </section>
        ) : null}
      </div>
    </div>
  );
}
