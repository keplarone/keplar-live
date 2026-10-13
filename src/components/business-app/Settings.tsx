"use client";
/**
 * Keplar Business settings: a floating popover over the workspace (never a page), opened from the account button, the gear or
 * Ctrl+, (⌘, on a Mac). Whatever is open underneath (a chat, a build, a report) stays mounted and keeps its state.
 *
 * Everything here works against real endpoints: the business profile saves through /api/business/account, usage comes from
 * /api/business/dashboard, "Pause all agents" is /api/business/agents/halt, "Manage subscription" opens Whop's own page
 * (/api/billing/portal), the export downloads the account's data (/api/account/export), and sign-out revokes this device's
 * Business sessions. Two-factor, passkeys, sessions and account deletion belong to the one Keplar account, so those link to it.
 * Team invites run on Keplar's team API (TeamPanel.tsx). Device preferences are saved in this browser. What the workspace
 * cannot do yet is labelled as such, never simulated.
 */
import { useEffect, useRef, useState } from "react";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/business/account-fields";
import { BUSINESS_TIERS, type BusinessTier } from "@/lib/business/tiers";
import { siteUrl } from "@/lib/site";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "@/components/business-site/sign-out";
import { MODE_KEY, SETTINGS_SECTIONS, SIDE_KEY, type SettingsSection } from "./settings-sections";
import { TeamPanel } from "./TeamPanel";
import s from "./settings.module.css";

type Profile = { company: string; website: string; size: string; industry: string; role: string };
type Account = {
  signedIn: boolean; email?: string | null; account?: Profile | null; active?: boolean; plan?: { tier: string | null; name: string } | null;
  member?: { role: string; teamName: string; owner: string } | null;
  download?: { version: string; files: { os: string; arch: string; type: string; url: string; size: number }[]; notesUrl: string } | null;
};
type Dash = { entitlements?: { label: string }; compute?: { used: number; total: number | null; resetsAt?: string }; agents?: { active: number; total: number; halted: boolean } };

const LIVE_CODE_KEY = "kc-live-code";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const mb = (n: number) => `${(n / 1_048_576).toFixed(0)} MB`;
const isTier = (t: unknown): t is BusinessTier => t === "starter" || t === "growth" || t === "scale" || t === "enterprise";

const ICONS: Record<SettingsSection, React.ReactNode> = {
  general: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5" /></>,
  ai: <><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /></>,
  editor: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></>,
  agents: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4M9.5 13h.01M14.5 13h.01" /></>,
  connections: <><path d="M9 7V3M15 7V3" /><path d="M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></>,
  security: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></>,
  computer: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  billing: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  team: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 19c.8-2.8 2.9-4 5.5-4s4.7 1.2 5.5 4M15 15.2c2.6-.4 4.6.8 5.5 3.3" /></>,
};
const Icon = ({ d }: { d: React.ReactNode }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

function Row({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className={s.row}>
      <div className={s.rowText}><div className={s.rowLabel} id={id}>{label}</div>{hint ? <p className={s.hint}>{hint}</p> : null}</div>
      <div className={s.rowControl}>{children}</div>
    </div>
  );
}

const Status = ({ children }: { children: React.ReactNode }) => <span className={s.status}>{children}</span>;

export function Settings({ section, onSection, onClose, onOpenPlace }: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  onClose: () => void;
  /** Opens a workspace module (Agents, Approvals, Integrations) and closes the popover. */
  onOpenPlace: (place: "agents" | "approvals" | "integrations" | "computer") => void;
}) {
  const [acct, setAcct] = useState<Account | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [form, setForm] = useState<Profile | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Profile, string>>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [sideClosed, setSideClosed] = useState(() => read(SIDE_KEY) === "closed");
  const [liveCode, setLiveCode] = useState(() => read(LIVE_CODE_KEY) !== "hidden");
  const [mode, setMode] = useState(() => read(MODE_KEY) ?? "ask");
  const panel = useRef<HTMLDivElement>(null);
  // The desktop app (0.1.8+) exposes computer use on this page.
  const [desktop] = useState(() => typeof window !== "undefined" && "keplarComputer" in window);

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

  // Focus moves into the popover when it opens and back to whatever opened it when it closes. Esc closes it; Tab stays inside.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[aria-current='true']")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); before?.focus?.({ preventScroll: true }); };
  }, [onClose]);

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
      say("Profile saved.");
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

  const halt = async (halted: boolean) => {
    setBusy("halt");
    try {
      const res = await fetch("/api/business/agents/halt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ halted }) });
      if (!res.ok) { say("That didn't change. Try again."); return; }
      setDash((d) => (d && d.agents ? { ...d, agents: { ...d.agents, halted } } : d));
      say(halted ? "Every agent is paused." : "Agents can run again.");
    } finally { setBusy(""); }
  };

  const used = dash?.compute?.used ?? null;
  const total = dash?.compute?.total ?? null;
  const pct = used !== null && total ? Math.min(100, Math.round((used / total) * 100)) : null;
  const tier = isTier(acct?.plan?.tier) ? BUSINESS_TIERS[acct.plan.tier] : null;
  const field = (k: keyof Profile) => ({ value: form?.[k] ?? "", "aria-invalid": Boolean(errors[k]) || undefined, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f)) });
  const label = SETTINGS_SECTIONS.find((x) => x.id === section)?.label;

  return (
    <>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={s.popover} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <nav className={s.nav} aria-label="Settings sections">
          <p className={s.navHead}>Settings</p>
          {SETTINGS_SECTIONS.map((x) => (
            <button key={x.id} type="button" className={s.navItem} aria-current={section === x.id ? "true" : undefined} onClick={() => onSection(x.id)}>
              <Icon d={ICONS[x.id]} />{x.label}
            </button>
          ))}
        </nav>

        <div className={s.body}>
          <header className={s.head}>
            <h2 id="settings-title" className={s.title}>{label}</h2>
            <button type="button" className={s.close} onClick={onClose} aria-label="Close settings" title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className={s.scroll} key={section}>
            {!acct ? <div className={s.loading} aria-label="Loading"><span /><span /><span /></div> : null}

            {acct && section === "general" && acct.member ? (
              <>
                <Row label="Email" hint="Your Keplar account. One account signs in to Keplar One and Keplar Business."><span className={s.value}>{acct.email ?? "—"}</span></Row>
                <Row label="Workspace" hint={`You work in ${acct.member.teamName}'s Business workspace, owned by ${acct.member.owner}.`}><span className={s.value}>{acct.account?.company ?? acct.member.teamName}</span></Row>
                <Row label="Your role" hint="The owner or an admin can change it on the Team tab."><span className={s.value}>{acct.member.role === "member" ? "Editor" : acct.member.role[0]!.toUpperCase() + acct.member.role.slice(1)}</span></Row>
                <p className={s.note}>Only the owner can change the business profile.</p>
              </>
            ) : null}

            {acct && section === "general" && !acct.member ? (
              <>
                <Row label="Email" hint="Your Keplar account. One account signs in to Keplar One and Keplar Business."><span className={s.value}>{acct.email ?? "—"}</span></Row>
                <h3 className={s.group}>Business profile</h3>
                <Row label="Company" id="set-company">{<><input className={s.input} aria-labelledby="set-company" autoComplete="organization" {...field("company")} />{errors.company ? <em className={s.err}>{errors.company}</em> : null}</>}</Row>
                <Row label="Website" hint="Optional." id="set-website">{<><input className={s.input} aria-labelledby="set-website" inputMode="url" placeholder="example.com" {...field("website")} />{errors.website ? <em className={s.err}>{errors.website}</em> : null}</>}</Row>
                <Row label="Company size" id="set-size">{<><select className={s.input} aria-labelledby="set-size" {...field("size")}><option value="">Choose…</option>{COMPANY_SIZES.map((x) => <option key={x}>{x}</option>)}</select>{errors.size ? <em className={s.err}>{errors.size}</em> : null}</>}</Row>
                <Row label="Industry" id="set-industry">{<><select className={s.input} aria-labelledby="set-industry" {...field("industry")}><option value="">Choose…</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select>{errors.industry ? <em className={s.err}>{errors.industry}</em> : null}</>}</Row>
                <Row label="Your role" id="set-role">{<><input className={s.input} aria-labelledby="set-role" autoComplete="organization-title" {...field("role")} />{errors.role ? <em className={s.err}>{errors.role}</em> : null}</>}</Row>
                <div className={s.actions}><button type="button" className={s.primary} onClick={() => void saveProfile()} disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save profile"}</button></div>
              </>
            ) : null}

            {acct && section === "ai" ? (
              <>
                <Row label="Start new chats in" hint="The mode the home composer opens with on this device. Alt+M switches while you type." id="set-mode">
                  <select className={s.input} aria-labelledby="set-mode" value={mode} onChange={(e) => { setMode(e.target.value); write(MODE_KEY, e.target.value); say("Saved on this device."); }}>
                    <option value="ask">Ask</option><option value="research">Deep Research</option><option value="reason">Reason</option>
                  </select>
                </Row>
                <Row label="Models" hint="Keplar routes each task to the models suited to it, and Deep Research and Reason cross-check across more than one."><span className={s.value}>Automatic</span></Row>
                <Row label="Model training" hint="Paid plans, Business included, send requests only to model endpoints that say they do not train on prompts."><a className={s.link} href={`${siteUrl}/privacy`} target="_blank" rel="noopener">Privacy policy</a></Row>
              </>
            ) : null}

            {acct && section === "editor" ? (
              <>
                <p className={s.note}>Saved on this device.</p>
                <Row label="Show code while Create builds" hint="The live code panel with the build's tasks, files and log.">
                  <input type="checkbox" role="switch" className={s.switch} checked={liveCode} onChange={(e) => { setLiveCode(e.target.checked); write(LIVE_CODE_KEY, e.target.checked ? "shown" : "hidden"); }} aria-label="Show code while Create builds" />
                </Row>
                <Row label="Start with the sidebar collapsed">
                  <input type="checkbox" role="switch" className={s.switch} checked={sideClosed} onChange={(e) => { setSideClosed(e.target.checked); write(SIDE_KEY, e.target.checked ? "closed" : "open"); say("Applies the next time the workspace opens."); }} aria-label="Start with the sidebar collapsed" />
                </Row>
                <Row label="Theme" hint="Keplar Business is always dark."><span className={s.value}>Dark</span></Row>
                <Row label="Keyboard" hint="Ctrl+K jumps anywhere. Ctrl+, opens settings. Ctrl+B shows or hides the sidebar. (⌘ on a Mac.)"><span className={s.value}>⌘K · ⌘, · ⌘B</span></Row>
              </>
            ) : null}

            {acct && section === "agents" ? (
              <>
                <Row label="Active agents" hint={tier?.activeAgents ? `Your plan runs up to ${tier.activeAgents} at once.` : undefined}>
                  <span className={s.value}>{dash?.agents ? `${dash.agents.active} of ${dash.agents.total}` : "—"}</span>
                </Row>
                <Row label="Pause all agents" hint="Stops every agent in the workspace until you turn this off. Runs already waiting in Approvals stay there.">
                  <input type="checkbox" role="switch" className={s.switch} checked={Boolean(dash?.agents?.halted)} disabled={!dash?.agents || busy === "halt"} onChange={(e) => void halt(e.target.checked)} aria-label="Pause all agents" />
                </Row>
                <Row label="Approvals" hint="Payments, messages to customers and deploys wait for a person."><button type="button" className={s.ghost} onClick={() => onOpenPlace("approvals")}>Open Approvals</button></Row>
                <Row label="Schedules and budgets" hint="Set per agent."><button type="button" className={s.ghost} onClick={() => onOpenPlace("agents")}>Open Agents</button></Row>
              </>
            ) : null}

            {acct && section === "connections" ? (
              <>
                <Row label="Apps and data" hint="Payments, email, chat and the other services your agents and dashboard read from."><button type="button" className={s.ghost} onClick={() => onOpenPlace("integrations")}>Manage connections</button></Row>
                <Row label="Custom domains" hint={tier ? `Your plan includes ${tier.customDomains}. Connect them from a project in Create.` : "Connect them from a project in Create."}><span className={s.value}>{tier ? tier.customDomains : "—"}</span></Row>
              </>
            ) : null}

            {acct && section === "security" ? (
              <>
                <Row label="Two-factor and passkeys" hint="Set on your Keplar account; they protect Keplar Business sign-ins too."><a className={s.ghost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Account security</a></Row>
                <Row label="Signed-in devices" hint="See and end sessions on your Keplar account."><a className={s.ghost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Manage devices</a></Row>
                <Row label="This device" hint="Ends every Keplar Business session here. Keplar One stays signed in.">
                  <button type="button" className={s.ghost} disabled={busy === "signout"} onClick={async () => { setBusy("signout"); if (!(await signOutOfBusiness())) { setBusy(""); say(SIGN_OUT_FAILED); } }}>{busy === "signout" ? "Signing out…" : "Sign out"}</button>
                </Row>
                <h3 className={s.group}>Data</h3>
                <Row label="Export your data" hint="Everything your account owns, as JSON, with secrets redacted."><a className={s.ghost} href="/api/account/export" download>Download export</a></Row>
                <Row label="Delete your account" hint="Deletes the Keplar account and its Business data after a 14-day grace period. Payment records the law requires are kept."><a className={s.ghost} href={`${siteUrl}/account`} target="_blank" rel="noopener">Account settings</a></Row>
              </>
            ) : null}

            {acct && section === "computer" ? (
              <>
                <h3 className={s.group}>Desktop app</h3>
                {acct.download ? (
                  <>
                    <Row label="Latest version"><span className={s.value}>{acct.download.version}</span></Row>
                    {acct.download.files.map((f) => (
                      <Row key={f.url} label={`${f.os === "macos" ? "macOS" : f.os === "windows" ? "Windows" : "Linux"} · ${f.arch}`} hint={`.${f.type} · ${mb(f.size)}`}><a className={s.ghost} href={f.url}>Download</a></Row>
                    ))}
                    <Row label="Release notes"><a className={s.link} href={acct.download.notesUrl} target="_blank" rel="noopener">What changed</a></Row>
                    <p className={s.note}>The desktop app updates itself. Installers are not yet code-signed, so Windows and macOS show a warning the first time.</p>
                  </>
                ) : <p className={s.note}>Downloads appear here once your Business plan is active.</p>}
                <h3 className={s.group}>Control</h3>
                <Row label="Computer use" hint={desktop ? "Keplar operates apps on this computer one approved step at a time. Spending, sending, deleting and signing in always ask first." : "Keplar operating apps on your computer runs in the desktop app (0.1.8 or later); a browser can't control a computer."}>
                  {desktop ? <button type="button" className={s.ghost} onClick={() => onOpenPlace("computer")}>Open Computer use</button> : <Status>Desktop app only</Status>}
                </Row>
                <Row label="Screen sharing" hint="Share a screen, window or tab from the screen button in the composer. Each Capture attaches a frame; nothing is captured in the background."><Status>On, from the composer</Status></Row>
              </>
            ) : null}

            {acct && section === "billing" ? (
              <>
                <Row label="Plan"><span className={s.value}>{acct.plan?.name ?? (acct.active ? "Keplar Business" : "No Business plan")}</span></Row>
                <Row label="Usage this period" hint={`Credits are shared across Keplar; one credit is $0.002 of model cost.${dash?.compute?.resetsAt ? ` Resets ${new Date(dash.compute.resetsAt).toLocaleDateString()}.` : ""}`}>
                  {used !== null ? (
                    <div className={s.meter}>
                      <span>{used.toLocaleString()}{total ? ` / ${total.toLocaleString()}` : ""}</span>
                      {pct !== null ? <span className={s.bar} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Credits used"><i style={{ width: `${pct}%` }} /></span> : null}
                    </div>
                  ) : <span className={s.hint}>Not available right now.</span>}
                </Row>
                <div className={s.actions}>
                  <button type="button" className={s.primary} onClick={() => void manage()} disabled={busy === "portal"}>{busy === "portal" ? "Opening…" : "Manage subscription"}</button>
                  <a className={s.ghost} href="/#pricing" target="_blank" rel="noopener">Compare plans</a>
                </div>
                <p className={s.note}>Subscriptions are billed and managed by Whop. Cancel any time; the plan runs to the end of the paid month.</p>
              </>
            ) : null}

            {acct && section === "team" ? <TeamPanel company={acct.account?.company ?? null} seats={tier ? (tier.seats ?? null) : null} say={say} /> : null}
          </div>
          {msg ? <p className={s.toast} role="status">{msg}</p> : null}
        </div>
      </div>
    </>
  );
}
