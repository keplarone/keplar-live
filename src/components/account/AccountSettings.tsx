import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsSections } from "@/components/account/SettingsSections";
import { SettingsDialog } from "@/components/account/SettingsDialog";
import { DataControls } from "@/components/account/DataControls";
import { TwoFactorSettings } from "@/components/account/TwoFactorSettings";
import { PasskeySettings } from "@/components/account/PasskeySettings";
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
import { AccessibilityPrefs, AppearancePrefs, ChatPrefs, NotificationPrefs, ResetDevicePrefs, ShortcutList } from "@/components/account/DevicePrefs";
import { ThemeControl } from "@/components/theme/ThemeControl";
import { LanguageSettings } from "@/components/i18n/LanguageSettings";
import s from "@/components/account/account.module.css";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const PLAN_LABEL: Record<string, string> = { free: "Free", lite: "Lite", plus: "Plus", pro: "Pro", business: "Business" };

/**
 * One part of a Settings category: an optional plain heading over the panel. `id` keeps old deep links working (/account#team,
 * #api, #language…): SettingsSections opens the category that contains the element with that id and scrolls to it.
 */
function sub(id: string | null, heading: React.ReactNode, node: React.ReactNode) {
  return (
    <div className={s.sub} id={id ?? undefined}>
      {heading ? <h3 className={s.subHeading}>{heading}</h3> : null}
      {node}
    </div>
  );
}

/**
 * Settings, as one dialog (Claude-style: categories on the left, the chosen one on the right). Rendered two ways with the same
 * content: over the app (src/app/app/@modal/(..)account, opened from the sidebar, account menu or Ctrl/⌘+,) and on its own
 * at /account for direct visits and deep links.
 */
export async function AccountSettings({ mode, checkout, payStatus }: { mode: "modal" | "page"; checkout?: string; payStatus?: string }) {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect("/signin");
  const row = await ensureWorkspaceForUser({ id: session.user.id, email: session.user.email, name: session.user.name });
  const ws = await currentWorkspace(new Request("http://internal/account", { headers: h }));
  const plan = ws.plan === "free" || ws.plan === "lite" || ws.plan === "plus" || ws.plan === "pro" || ws.plan === "business" ? ws.plan : row.plan;
  const m = await meter(ws);
  const daily = ws.plan === "free" && !ws.admin ? await dailyMeter(dailySubjects({ workspaceId: ws.id, anonymous: false, ip: clientIpOf(new Request("http://internal/account", { headers: h })), cookie: null, secure: true, limit: limitsFor("free").dailyRequests, ipLimit: limitsFor("free").dailyIpRequests })) : null;
  const onboarding = await getOnboarding(session.user.id);
  // Opening Settings is the "see your plan and usage" step of the getting-started checklist.
  if (onboarding.enabled && onboarding.required && !onboarding.progress.viewedPlan) await markProgress(session.user.id, "viewedPlan").catch(() => undefined);
  const payFailed = payStatus === "failed" || payStatus === "canceled";
  const pct = m.total ? Math.min(100, Math.round((m.used / m.total) * 100)) : 0;
  const checkoutReady = checkoutAvailable();
  const canRefresh = whopCheckoutConfigured();
  const planLabel = ws.admin ? "Admin" : (PLAN_LABEL[plan] ?? plan);

  return (
    <SettingsDialog mode={mode}>
      <SettingsSections
        initial={checkout || payStatus ? "plan" : undefined}
        sections={[
          { id: "account", label: "Account", keywords: "profile name email verified sign out log out signed in", node: (<>
            <div className={s.panel}>
              <div className={s.row}><span className={s.k}>Workspace</span><span className={s.v}>{row.name}</span></div>
              <div className={s.row}><span className={s.k}>Signed in as</span><span className={`${s.v} ${s.vEmail}`}><span className={s.email}>{session.user.email}</span> {session.user.emailVerified ? <span className={s.badge}>Verified</span> : <span className={s.badge}>Unverified</span>}</span></div>
              <div className={s.row}><span className={s.k}>Plan</span><span className={s.v}><a className={s.link} href="#plan">{planLabel}</a></span></div>
            </div>
            <div className={s.panel}>
              <div className={s.row}><span className={s.k}>Sign out of Keplar on this device</span><SignOutButton /></div>
              <p className={s.note}>To sign out everywhere, use Devices under Security.</p>
            </div>
          </>) },
          { id: "general", label: "General", keywords: "language languages locale translation translate idioma langue sprache 言語 语言 لغة right to left rtl onboarding tour replay welcome setup intro guide reset defaults device", node: (<>
            {sub("language", null, <LanguageSettings />)}
            {onboarding.enabled ? sub("start", "Getting started", <ReplayOnboarding legacy={onboarding.status === "legacy"} />) : null}
            {sub("device-reset", "Settings on this device", <ResetDevicePrefs />)}
          </>) },
          { id: "appearance", label: "Appearance", keywords: "theme dark light auto display colour color appearance text size font serif dyslexia readable chat width wide full code wrap", node: (<>
            {sub("theme", null, <div className={s.panel}>
              <div className={s.prefRow}>
                <div className={s.prefText}><span className={s.prefLabel} id="theme-setting">Theme</span><span className={s.prefHint}>Auto follows your device.</span></div>
                <ThemeControl />
              </div>
            </div>)}
            {sub("display", null, <AppearancePrefs />)}
          </>) },
          { id: "accessibility", label: "Accessibility", keywords: "a11y reduce motion animation contrast underline links focus ring outline keyboard vision", node: sub("a11y", null, <AccessibilityPrefs />) },
          { id: "chat", label: "Chat", keywords: "send enter ctrl cmd new line shift scroll follow stream spell check spelling typos ask box composer", node: sub("chat-prefs", null, <ChatPrefs />) },
          { id: "notifications", label: "Notifications", keywords: "notify notification alert desktop sound chime ping done ready email", node: sub("notify", null, <NotificationPrefs />) },
          { id: "keyboard", label: "Keyboard", keywords: "shortcuts hotkeys keys keybindings insert key overtype overwrite ins ovr block caret typing", node: (<>
            {sub("shortcuts", "Shortcuts", <ShortcutList />)}
            {sub("typing", "Typing", <TypingSettings />)}
          </>) },
          { id: "personalization", label: "Personalization", keywords: "custom instructions about you style tone answer preferences brief formal teaching plain language how to answer constellation assistant custom bot persona instructions knowledge starters expert kids teen parental controls pin child safety homework family predictive preloading", node: (<>
            {sub(null, null, <PersonalizationSettings />)}
            {sub(null, null, <SpecialistsSettings />)}
            {sub(null, null, <FamilySettings />)}
            {sub(null, null, <PredictionSettings />)}
          </>) },
          { id: "memory", label: "Memory", keywords: "remember memories saved preferences forget clear notes", node: sub(null, null, <MemorySettings />) },
          { id: "plan", label: "Billing", keywords: "plan subscription upgrade manage billing invoices receipts payment card price renew cancel admin referral refer invite friend reward bonus", node: (<>
            {payFailed ? <p className={`${s.note} ${s.err}`} role="status">The payment didn&rsquo;t go through, so nothing was charged. You can try again from the upgrade buttons below.</p> : null}
            {checkout === "success" && !payFailed ? <p className={`${s.note} ${s.ok}`} role="status">Thanks. Your plan updates as soon as the payment is confirmed. Use Refresh plan if it hasn&rsquo;t changed in a minute.</p> : null}
            {checkout === "canceled" ? <p className={s.note} role="status">Checkout canceled. Nothing was charged.</p> : null}
            <div className={s.panel}>
              <div className={s.row}><span className={s.k}>Plan</span><span className={s.v}>{planLabel}</span></div>
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
            <AccountActions plan={plan} checkoutReady={checkoutReady} canRefresh={canRefresh} canManage={Boolean(row.billing.manageUrl) || isPaidPlan(plan)} admin={ws.admin} liteReady={Boolean(embedPlanId("lite"))} />
            {isPaidPlan(plan) && !ws.admin ? <p className={s.note}>Invoices, receipts, your card and cancelation are all in Manage billing &amp; invoices (opens Whop). Cancel any time; you keep your plan until the period ends.</p> : null}
            {sub("invite", "Invite friends", <InvitePanel />)}
          </>) },
          { id: "usage", label: "Usage", keywords: "usage credits limits left remaining quota daily weekly reset", node: (
            <div className={s.panel} id="usage-meter">
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
          ) },
          { id: "security", label: "Security", keywords: "2fa authenticator totp security code recovery login protect passkey passkeys webauthn fingerprint face biometric sessions sign out signed in browsers devices", node: (<>
            {sub(null, null, <><TwoFactorSettings admin={ws.admin} /><PasskeySettings /></>)}
            {sub(null, "Devices", <DeviceSessions />)}
          </>) },
          { id: "privacy", label: "Privacy", keywords: "cookies analytics consent tracking share link revoke public chat answer url redaction export download delete account erase gdpr privacy data", node: (<>
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
          { id: "team", label: "Team", keywords: "team workspace share teammates members roles admin viewer invite audit log business shared projects chats sites seats", node: sub("team-workspace", null, <TeamPanel />) },
          { id: "developer", label: "Developer", keywords: "api keys developer developers token bearer curl script integration extension programmatic embed widget iframe script website site drop-in ask chatbot", node: (<>
            {sub("api", "Developer API", <ApiKeysPanel />)}
            {sub("embed", "Embed Ask", <EmbedPanel />)}
          </>) },
        ]}
      />
    </SettingsDialog>
  );
}
