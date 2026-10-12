import { SettingsSections } from "@/components/account/SettingsSections";
import Link from "next/link";
import { DataControls } from "@/components/account/DataControls";
import { TwoFactorSettings } from "@/components/account/TwoFactorSettings";
import { PasskeySettings } from "@/components/account/PasskeySettings";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession } from "@/lib/accounts/auth";
import { dailyMeter, dailySubjects } from "@/lib/usage/daily";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { limitsFor } from "@/lib/orchestration/limits";
import { DailyLeft } from "@/components/account/DailyLeft";
import { ensureWorkspaceForUser } from "@/lib/accounts/workspaces";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { meter } from "@/lib/create/platform/compute";
import { checkoutAvailable, whopCheckoutConfigured } from "@/lib/billing/whop";
import { embedPlanId, isPaidPlan, PAID_PLANS } from "@/lib/billing/plans";
import { WINDOW_WARN_AT, windowResetText } from "@/lib/orchestration/plans";
import { AccountActions, SignOutButton } from "@/components/account/AccountActions";
import { DeviceSessions } from "@/components/account/DeviceSessions";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import { ReplayOnboarding } from "@/components/onboarding/ReplayOnboarding";
import { getOnboarding, markProgress } from "@/lib/onboarding/store";
import { InvitePanel } from "@/components/account/InvitePanel";
import { TeamPanel } from "@/components/account/TeamPanel";
import { ApiKeysPanel } from "@/components/account/ApiKeysPanel";
import { EmbedPanel } from "@/components/account/EmbedPanel";
import { MemorySettings } from "@/components/account/MemorySettings";
import { FamilySettings, PersonalizationSettings, SharedLinksSettings, SpecialistsSettings } from "@/components/account/PersonalSettings";
import { PredictionSettings } from "@/components/account/PredictionSettings";
import { DeleteAllChats } from "@/components/account/DeleteAllChats";
import { TypingSettings } from "@/components/account/TypingSettings";
import { ThemeControl } from "@/components/theme/ThemeControl";
import { LanguageSettings } from "@/components/i18n/LanguageSettings";
import s from "@/components/account/account.module.css";

export const metadata = pageMeta("/account", "Account", "Your Keplar account.");
export const dynamic = "force-dynamic";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const PLAN_LABEL: Record<string, string> = { free: "Free", lite: "Lite", plus: "Plus", pro: "Pro", business: "Business" };

/**
 * One part of a Settings group: an optional plain heading over the panel. `id` keeps old deep links working (/account#team,
 * #api, #language…): SettingsSections opens the group that contains the element with that id and scrolls to it.
 */
function sub(id: string | null, heading: React.ReactNode, node: React.ReactNode) {
  return (
    <div className={s.sub} id={id ?? undefined}>
      {heading ? <h2 className={s.subHeading}>{heading}</h2> : null}
      {node}
    </div>
  );
}

type Props = { searchParams: Promise<{ checkout?: string; status?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect("/signin");
  const row = await ensureWorkspaceForUser({ id: session.user.id, email: session.user.email, name: session.user.name });
  const ws = await currentWorkspace(new Request("http://internal/account", { headers: h }));
  const plan = ws.plan === "free" || ws.plan === "lite" || ws.plan === "plus" || ws.plan === "pro" || ws.plan === "business" ? ws.plan : row.plan;
  const m = await meter(ws);
  const daily = ws.plan === "free" && !ws.admin ? await dailyMeter(dailySubjects({ workspaceId: ws.id, anonymous: false, ip: clientIpOf(new Request("http://internal/account", { headers: h })), cookie: null, secure: true, limit: limitsFor("free").dailyRequests, ipLimit: limitsFor("free").dailyIpRequests })) : null;
  const { checkout, status: payStatus } = await searchParams;
  const onboarding = await getOnboarding(session.user.id);
  // Opening this page is the "see your plan and usage" step of the getting-started checklist.
  if (onboarding.enabled && onboarding.required && !onboarding.progress.viewedPlan) await markProgress(session.user.id, "viewedPlan").catch(() => undefined);
  const payFailed = payStatus === "failed" || payStatus === "canceled";
  const pct = m.total ? Math.min(100, Math.round((m.used / m.total) * 100)) : 0;
  const checkoutReady = checkoutAvailable();
  const canRefresh = whopCheckoutConfigured();
  return (
    <section className={s.page}>
      <div className={`${s.card} ${s.wide}`}>
        <Link className={s.backLink} href="/app/ask"><span aria-hidden="true">←</span> Back to Keplar</Link>
        <h1 className={s.title}>Settings</h1>
        <p className={s.lead}>{row.name}</p>
        {payFailed ? <p className={`${s.note} ${s.err}`} role="status">The payment didn&rsquo;t go through, so nothing was charged. You can try again from the upgrade buttons below.</p> : null}
        {checkout === "success" && !payFailed ? <p className={`${s.note} ${s.ok}`} role="status">Thanks. Your plan updates as soon as the payment is confirmed. Use Refresh plan if it hasn&rsquo;t changed in a minute.</p> : null}
        {checkout === "canceled" ? <p className={s.note} role="status">Checkout canceled. Nothing was charged.</p> : null}
        <SettingsSections
          sections={[
            { id: "plan", label: "Plan & usage", keywords: "account email usage credits limits subscription upgrade manage billing invoices receipts payment card price renew cancel verified sign out admin referral refer invite friend reward bonus", node: (<>

        <div className={s.panel}>
          <div className={s.row}><span className={s.k}>Signed in as</span><span className={`${s.v} ${s.vEmail}`}><span className={s.email}>{session.user.email}</span> {session.user.emailVerified ? <span className={s.badge}>Verified</span> : <span className={s.badge}>Unverified</span>}</span></div>
          <div className={s.row}><span className={s.k}>Plan</span><span className={s.v}>{ws.admin ? "Admin" : (PLAN_LABEL[plan] ?? plan)}</span></div>
          {ws.admin ? (
            <div className={s.row}><span className={s.k}>Billing</span><span className={s.v}>No subscription needed<span className={s.sub}>Admin accounts aren&rsquo;t billed and have no plan limits.</span></span></div>
          ) : (
            <>
              <div className={s.row}><span className={s.k}>Billing status</span><span className={s.v}>{isPaidPlan(plan) ? (row.billing.status === "past_due" ? "Past due" : "Active") : "No subscription"}{row.billing.cancelAtPeriodEnd ? " · cancels at period end" : ""}</span></div>
              {row.billing.status === "past_due" ? <p className={`${s.note} ${s.err}`} role="alert">Your last payment failed. Update your card in Manage billing to keep your plan.</p> : null}
              <div className={s.row}><span className={s.k}>{isPaidPlan(plan) ? (row.billing.cancelAtPeriodEnd ? "Ends on" : "Renews on") : "Usage period"}</span><span className={s.v}>{isPaidPlan(plan) ? fmt(ws.period.end) : `${fmt(ws.period.start)} – ${fmt(ws.period.end)}`}</span></div>
              {isPaidPlan(plan) ? <div className={s.row}><span className={s.k}>Price</span><span className={s.v}>${PAID_PLANS[plan].usdMonthly}/month · billed through Whop</span></div> : null}
            </>
          )}
        </div>
        <div className={s.panel} id="usage">
          <div className={s.row}><span className={s.k}>{ws.admin ? "Usage" : "Credits left"}</span><span className={s.v}>{ws.admin ? "Unlimited" : m.total ? `${Math.max(0, m.total - m.used).toLocaleString()} of ${m.total.toLocaleString()}` : plan === "free" ? "Not needed on Free (questions are counted daily, below)" : `${m.used.toLocaleString()} used`}</span></div>
          {daily ? <div className={s.row} data-free-daily=""><span className={s.k}>Questions left today</span><span className={s.v}><DailyLeft initial={daily} /></span></div> : null}
          {m.total ? <div className={s.track} role="progressbar" aria-label="Credits used this period" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={s.fill} style={{ width: `${pct}%` }} /></div> : null}
          {m.windows?.map((w) => {
            const wp = Math.min(100, Math.round((w.used / w.limit) * 100));
            const warn = wp >= WINDOW_WARN_AT * 100;
            return (
              <div key={w.id} data-window={w.id}>
                <div className={s.row}><span className={s.k}>{w.label} limit</span><span className={s.v}>{Math.max(0, w.limit - w.used).toLocaleString()} of {w.limit.toLocaleString()} left</span></div>
                <div className={s.track} role="progressbar" aria-label={`${w.label} usage limit used`} aria-valuenow={wp} aria-valuemin={0} aria-valuemax={100}><div className={s.fill} style={{ width: `${wp}%` }} data-warn={warn || undefined} /></div>
                <p className={s.note}>{wp >= 100 ? "Limit reached. " : warn ? "Nearly at your limit. " : ""}{windowResetText(w.id, w.resetsAt)}.{wp >= 100 && (plan === "plus" || plan === "lite") ? ` Upgrade to ${plan === "lite" ? "Plus" : "Pro"} for higher limits.` : ""}</p>
              </div>
            );
          })}
          <p className={s.note}>{m.total ? `Credits renew on ${fmt(m.resetsAt)}. ` : ""}{ws.admin ? "Admin use is shared across the app, Create and Business." : "Shared across the app, Create and Business."}{m.paused ? " Free usage is paused for today (daily capacity reached)." : ""}</p>
        </div>
        <AccountActions plan={plan} checkoutReady={checkoutReady} canRefresh={canRefresh} canManage={Boolean(row.billing.manageUrl) || isPaidPlan(plan)} admin={ws.admin} liteReady={Boolean(embedPlanId("lite"))} />
        {isPaidPlan(plan) && !ws.admin ? <p className={s.note}>Invoices, receipts, your card and cancelation are all in Manage billing &amp; invoices (opens Whop). Cancel any time; you keep your plan until the period ends.</p> : null}
                    {sub("invite", "Invite friends", <InvitePanel />)}
            </>) },
            { id: "general", label: "General", keywords: "theme dark light auto display colour color appearance language languages locale translation translate idioma langue sprache 言語 语言 لغة right to left rtl onboarding tour replay welcome setup intro guide", node: (<>
        {sub("appearance", null, <div className={s.panel}>
          <div className={s.row}>
            <span className={s.k} id="theme-setting">Theme</span>
            <ThemeControl />
          </div>
          <p className={s.note}>Auto follows your device&apos;s setting. Saved on this device.</p>
        </div>)}
        {sub("language", null, <LanguageSettings />)}
        {onboarding.enabled ? sub("start", "Getting started", <ReplayOnboarding legacy={onboarding.status === "legacy"} />) : null}
            </>) },
            { id: "personalization", label: "Personalization", keywords: "custom instructions about you style tone answer preferences brief formal teaching plain language how to answer remember memories saved preferences forget clear constellation assistant custom bot persona instructions knowledge starters expert kids teen parental controls pin child safety homework family", node: (<>
        {sub(null, null, <PersonalizationSettings />)}
        {sub(null, null, <PredictionSettings />)}
        {sub(null, null, <MemorySettings />)}
        {sub(null, null, <SpecialistsSettings />)}
        {sub(null, null, <FamilySettings />)}
            </>) },
            { id: "privacy", label: "Privacy & security", keywords: "2fa authenticator totp security code recovery login protect passkey passkeys webauthn fingerprint face biometric sessions sign out signed in browsers devices cookies analytics consent tracking share link revoke public chat answer url redaction export download delete account erase gdpr privacy data", node: (<>
        {sub(null, null, <><TwoFactorSettings admin={ws.admin} /><PasskeySettings /></>)}
        {sub(null, "Devices", <DeviceSessions />)}
        {sub("privacy-cookies", null, <div className={s.panel}>
          <div className={s.row}>
            <span className={s.k}>Cookies</span>
            <CookieSettingsButton className={s.link}>Cookie settings</CookieSettingsButton>
          </div>
          <p className={s.note}>Essential cookies (sign-in, security, plan, theme) are always on. Analytics is optional and off until you allow it.</p>
        </div>)}
        {sub(null, null, <SharedLinksSettings />)}
        {sub(null, null, <><DeleteAllChats userId={session.user.id} /><DataControls email={session.user.email} admin={ws.admin} /></>)}
            </>) },
            { id: "advanced", label: "Advanced", keywords: "team workspace share teammates members roles admin viewer invite audit log business shared projects chats sites seats api keys developer developers token bearer curl script integration extension programmatic embed widget iframe script website site drop-in ask chatbot insert key overtype overwrite ins ovr block caret keyboard typing beta", node: (<>
        {sub("team", "Team workspace", <TeamPanel />)}
        {sub("api", "Developer API", <ApiKeysPanel />)}
        {sub("embed", "Embed Ask", <EmbedPanel />)}
        {sub("typing", "Typing", <TypingSettings />)}
            </>) },
          ]}
        />
        <div className={s.pageFooter}>
          <SignOutButton />
        </div>
      </div>
    </section>
  );
}
