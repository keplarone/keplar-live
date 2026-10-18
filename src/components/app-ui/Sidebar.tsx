"use client";

import Link from "next/link";
import { KeplarLogo } from "@/components/brand";
import { formatResetAt, PLAN_ALLOWANCES, WINDOW_WARN_AT, windowResetText } from "@/lib/orchestration/plans";
import { brand } from "@/lib/site";
import { dailyLeftText, formatDailyReset } from "@/lib/usage/format";
import { extensionNote, usageMeter } from "@/lib/usage/meter";
import { IconClose, IconMenu, IconPlus, IconSearch, IconSettings } from "./icons";
import type { AccountInfo, AppState, View } from "./state/types";
import { AccountMenu, ImportPrompt, type ImportOffer } from "./AccountMenu";
import s from "./App.module.css";
import la from "./link-action.module.css";
import { IconButton, Tooltip } from "@/components/kit";
import { Recents } from "./Recents";

type Props = {
  state: AppState;
  mac: boolean;
  onNew: () => void;
  onSearch: () => void;
  /** All chats, from the Recents list. Opens beside the thread when a chat is on screen. */
  onView: (v: View) => void;
  onOpen: (id: string) => void;
  /** Delete a chat from the Recent list (the list asks "Delete this chat?" first). Omit to hide the action. */
  onDeleteChat?: (id: string) => void;
  onClose?: () => void;
  /** Kept so callers compile. Business is its own app and is not a sidebar row. */
  businessProminent?: boolean;
  /** The signed-in account (null when signed out or not known yet). */
  account?: AccountInfo | null;
  /** Chats made on this device before signing in, offered to this account (consent required). */
  importOffer?: ImportOffer | null;
  id?: string;
  /** Hide the sidebar on a wide screen. Phones keep the slide-in drawer. */
  onToggleCollapse?: () => void;
};

/** Usage shows in the sidebar only when it is getting low (below this share left, or a usage window near its limit). */
const LOW_AT = 20;

export function Sidebar({ state, mac, onNew, onSearch, onView, onOpen, onDeleteChat, onClose, businessProminent = false, account = null, importOffer = null, id, onToggleCollapse }: Props) {
  void businessProminent;
  // One rule for the meter (src/lib/usage/meter.ts): Free = the daily "N of M left" count, paid = credits for the period, unlimited/unknown show no percentage.
  const um = usageMeter(state.ledger);
  const left = um.kind === "daily" || um.kind === "credits" ? um.pct : null;
  const reset = formatResetAt(state.ledger.resetsAt);
  const extra = extensionNote(state.ledger);
  const planName = PLAN_ALLOWANCES[state.ledger.plan].name;
  const note =
    um.kind === "unlimited" ? (um.reason === "admin" ? "Admin · no limit" : `${planName} · no fixed limit`)
    : um.kind === "daily" ? `${state.ledger.paused ? "Free usage paused today · " : "Free · "}${dailyLeftText(um)} today`
    : state.ledger.paused ? "Free usage paused today"
    : state.ledger.plan === "free" ? "Free · open models" : `${planName} · resets ${reset}`;
  const mod = mac ? "⌘" : "Ctrl ";
  const paidPlan = state.ledger.plan !== "free";
  const windows = (state.ledger.windows ?? []).map((w) => ({ ...w, pct: Math.min(100, Math.round((w.used / w.limit) * 100)) }));
  const windowWarn = windows.some((w) => w.pct >= WINDOW_WARN_AT * 100);
  const low = (left !== null && left < LOW_AT) || windowWarn || state.ledger.paused;

  // The full usage readout lives in the account menu; the same numbers, so the sidebar and the top bar always agree.
  const usage = (
    <div className={s.usageBlock} data-usage="">
      <div className={s.meterHead}>
        <span>{brand.usage}</span>
        <span className={s.meterValue} data-usage-left={left ?? um.kind}>{left !== null ? `${left}% left` : um.kind === "unlimited" ? "Unlimited" : "–"}</span>
      </div>
      {left !== null ? (
        <div
          className={s.meterTrack}
          role="meter"
          aria-label={`${brand.usage} remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={left}
          aria-valuetext={um.kind === "daily" ? `${dailyLeftText(um)} today, ${left} percent. Resets ${formatDailyReset(state.ledger.daily!.resetsAt)}.` : `${left} percent of this period's allowance left. Resets ${reset}.`}
        >
          <span style={{ width: `${left}%` }} data-low={left < 15 || undefined} />
        </div>
      ) : null}
      <p className={s.meterNote}>{note}</p>
      {extra ? <p className={s.meterNote} data-extension-credits="">{extra}</p> : null}
      {windows.map((w) => {
        const warn = w.pct >= WINDOW_WARN_AT * 100;
        return (
          <div key={w.id} className={s.windowRow} data-window={w.id}>
            <div className={s.meterHead}>
              <span>{w.label}</span>
              <span className={s.meterValue}>{w.pct}% used</span>
            </div>
            <div className={s.meterTrack} role="meter" aria-label={`${w.label} usage limit`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.pct} aria-valuetext={`${w.pct} percent of the ${w.label.toLowerCase()} limit used, ${windowResetText(w.id, w.resetsAt)}`}>
              <span style={{ width: `${w.pct}%` }} data-low={warn || undefined} />
            </div>
            <p className={s.meterNote}>{warn && w.pct < 100 ? "Nearly at your limit · " : w.pct >= 100 ? (extra ? "Limit reached, using extra credits · " : "Limit reached · ") : ""}{windowResetText(w.id, w.resetsAt)}</p>
          </div>
        );
      })}
    </div>
  );

  return (
    <nav className={s.sidebar} aria-label="Keplar" id={id}>
      <div className={s.sideTop} data-keplar-drag>
        <Link href="/" className={s.sideBrand} aria-label="Keplar home">
          <KeplarLogo height={18} />
        </Link>
        {onToggleCollapse ? (
          <button type="button" className={s.collapseBtn} onClick={onToggleCollapse} aria-label="Collapse sidebar">
            <IconMenu size={16} />
          </button>
        ) : null}
        {onClose ? (
          <IconButton shape="circle" onClick={onClose} label="Close sidebar" tooltipSide="left" icon={<IconClose size={16} />} />
        ) : null}
      </div>

      <div className={s.sideScroll} data-side-scroll="">
      <ul className={s.sideNav} data-primary-nav="">
        <li>
          <button type="button" className={s.sideItem} data-nav="new" data-primary="" onClick={onNew} aria-keyshortcuts={mac ? "Meta+Shift+O" : "Control+Shift+O"}>
            <IconPlus size={15} />
            <span>New chat</span>
            <kbd className={s.kbd} aria-hidden="true">{mod}⇧O</kbd>
          </button>
        </li>
        <li>
          <button type="button" className={s.sideItem} data-nav="search" data-primary="" onClick={onSearch} aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}>
            <IconSearch size={15} />
            <span>Search chats</span>
            <kbd className={s.kbd} aria-hidden="true">{mod}K</kbd>
          </button>
        </li>
      </ul>

      <Recents threads={state.threads} activeId={state.activeThreadId} view={state.view} userKey={state.ledger.synced ? (account?.id ?? state.account?.id ?? "anon") : null} onOpen={onOpen} onDeleteChat={onDeleteChat} onAll={() => onView("history")} />
      </div>

      <div className={s.meter}>
        {state.ledger.synced && !state.ledger.signedIn ? (
          // Signed out: no usage meter at all, just the way in.
          <div className={s.signedOutRow}>
            <Link className={`${la.act} ${s.signInCta}`} data-variant="primary" href="/signin" data-plan-cta="signin">Sign in</Link>
            <Link className={s.meterLink} href="/pricing">See plans</Link>
          </div>
        ) : null}
        {state.ledger.synced && state.ledger.signedIn ? (
          <>
            {importOffer ? <ImportPrompt offer={importOffer} /> : null}
            {low ? (
              // Only when it matters: how much is left, and the way to more.
              <div className={s.lowUsage} data-usage-low="" role="status">
                <p className={s.meterNote}>{state.ledger.paused ? "Free usage paused today" : windowWarn && !(left !== null && left < LOW_AT) ? "Nearly at a usage limit" : um.kind === "daily" ? `${dailyLeftText(um)} today` : `${left ?? 0}% of your credits left`}</p>
                {left !== null ? <div className={s.meterTrack} aria-hidden="true"><span style={{ width: `${left}%` }} data-low={left < 15 || undefined} /></div> : null}
                <Link className={s.lowUsageCta} href={paidPlan ? "/account#plan" : "/pricing"} data-plan-cta="upgrade" data-low="">{paidPlan ? "Get more" : "Upgrade"}</Link>
              </div>
            ) : null}
            <div className={s.accountRow}>
              {account ? <AccountMenu account={account} plan={planName} paid={paidPlan} usage={usage} /> : <span className={s.grow} />}
              <Tooltip content="Settings">
                <Link href="/account" className={s.iconBtn} aria-label="Settings" data-nav="settings">
                  <IconSettings size={16} />
                </Link>
              </Tooltip>
            </div>
          </>
        ) : null}
      </div>
    </nav>
  );
}
