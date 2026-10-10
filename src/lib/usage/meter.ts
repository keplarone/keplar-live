/**
 * The one rule for "how much is left" in the sidebar Keplar Usage card. It reads the same numbers as the rest of the app:
 *  - Free is metered in questions per day ("23 of 50 left"), so percent left = left / limit of that same daily count.
 *    (Free has no monthly credit allowance; reading that one is what used to show a fake 100%.)
 *  - Plus, Pro and other paid plans are metered in credits for the period: percent left = (total - used) / total.
 *  - Admin and custom contracts have no fixed allowance: "unlimited", no percentage and no bar.
 *  - Not loaded yet or not known: "unknown", never a made-up 100%.
 */
export type MeterInput = {
  plan: "free" | "lite" | "plus" | "pro" | "business";
  used: number;
  total: number | null;
  admin?: boolean;
  daily?: { limit: number; left: number } | null;
  synced: boolean;
  signedIn: boolean;
  /** Bought limit-extension credits (paid plans). Shown next to the plan's meter, never folded into its percentage. */
  extension?: { balance: number; expiresAt: string | null } | null;
};

export type UsageMeter =
  | { kind: "unknown" }
  | { kind: "unlimited"; reason: "admin" | "custom" }
  | { kind: "daily"; left: number; limit: number; pct: number }
  | { kind: "credits"; left: number; total: number; pct: number };

/** Whole percent left, never 0% while something is left, never above 100. */
export function percentLeft(left: number, limit: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(limit) || limit <= 0) return 0;
  if (left <= 0) return 0;
  if (left >= limit) return 100;
  return Math.max(1, Math.floor((left / limit) * 100));
}

export function usageMeter(l: MeterInput): UsageMeter {
  if (!l.synced || !l.signedIn) return { kind: "unknown" };
  if (l.admin) return { kind: "unlimited", reason: "admin" };
  if (l.plan === "free") {
    const d = l.daily;
    if (!d || !Number.isFinite(d.limit) || d.limit <= 0 || !Number.isFinite(d.left)) return { kind: "unknown" };
    const left = Math.min(d.limit, Math.max(0, d.left));
    return { kind: "daily", left, limit: d.limit, pct: percentLeft(left, d.limit) };
  }
  if (l.total === null || !Number.isFinite(l.total) || l.total <= 0) return { kind: "unlimited", reason: "custom" };
  const left = Math.max(0, l.total - l.used);
  return { kind: "credits", left, total: l.total, pct: percentLeft(left, l.total) };
}

/**
 * Bought extension credits, shown as their own line ("+310 extra credits · until Dec 31") so the plan's percentage stays the plan's.
 * Null when there are none, on Free, for admin and for unlimited plans. They are spent only after the plan's own limit.
 */
export function extensionNote(l: Pick<MeterInput, "plan" | "admin" | "extension">, locale?: string): string | null {
  const e = l.extension;
  if (!e || l.admin || l.plan === "free" || !(e.balance > 0)) return null;
  const until = e.expiresAt && Number.isFinite(Date.parse(e.expiresAt)) ? ` · until ${new Date(e.expiresAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}` : "";
  return `+${Math.floor(e.balance).toLocaleString("en-US")} extra credits${until}`;
}

type DailyCount = { used: number; left: number; limit: number };

/** Free: one question taken off the daily count the moment it is sent (the server then confirms the real number). */
export function takeOne<T extends DailyCount>(d: T): T {
  return { ...d, used: Math.min(d.limit, d.used + 1), left: Math.max(0, d.left - 1) };
}

/** The question never reached Keplar (offline) and the server could not be asked for the real count: give the one taken back. */
export function giveBackOne<T extends DailyCount>(d: T): T {
  return { ...d, used: Math.max(0, d.used - 1), left: Math.min(d.limit, d.left + 1) };
}
