/** Small pure helpers for the chat's workspace cards (unit-tested). */
import type { OutboundAction } from "@/lib/business/types";
import type { Thread } from "../state/types";

/** Which of a list a spoken name means: exact, then starts-with, then contains (case, spacing and punctuation ignored). */
export function matchName<T extends { id: string; name: string }>(items: T[], name: string): { id: string } | { choices: T[] } {
  const norm = (v: string) => v.toLowerCase().replace(/\b(?:the|my|agent)\b/g, "").replace(/[^a-z0-9]+/g, "");
  const n = norm(name);
  if (!n) return items.length === 1 ? { id: items[0].id } : { choices: items };
  for (const test of [(x: string) => x === n, (x: string) => x.startsWith(n), (x: string) => x.includes(n) || (x.length > 2 && n.includes(x))]) {
    const hit = items.filter((a) => test(norm(a.name)));
    if (hit.length === 1) return { id: hit[0].id };
    if (hit.length > 1) return { choices: hit };
  }
  return { choices: items };
}

/** Minor units -> "$1,234.50". */
export const money = (minor: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format((minor || 0) / 100);

/** "today", "yesterday", "in 3 days", "Mar 4". */
export function relDay(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const day = 864e5;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const d = Math.floor((t - start.getTime()) / day);
  if (d === 0) return "today";
  if (d === -1) return "yesterday";
  if (d === 1) return "tomorrow";
  if (d > 1 && d < 7) return `in ${d} days`;
  if (d < 0 && d > -7) return `${-d} days ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A chat matches a search when its title or any message (question or answer) contains every word. */
export function threadMatches(t: Thread, q: string, skip?: ReadonlySet<string>): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [t.title, ...t.messages.filter((m) => !skip?.has(m.id)).map((m) => (m.role === "user" ? m.text : m.answer?.markdown ?? ""))].join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Chats a History card lists for a filter, newest first. Chats saved in the account but not opened yet (remote, no messages
 * loaded) count, matched by title. `skip` leaves out messages that must not match (the request that made the card, which
 * always contains its own words). With `preferTitles` (finding one chat to rename or delete), title matches win when any exist.
 */
export function historyHits(threads: Thread[], q: string, opts: { skip?: ReadonlySet<string>; preferTitles?: boolean; limit?: number } = {}): Thread[] {
  const all = threads.filter((t) => (t.remote || t.messages.length) && threadMatches(t, q, opts.skip)).sort((a, b) => b.updatedAt - a.updatedAt);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const titled = opts.preferTitles && words.length ? all.filter((t) => words.every((w) => t.title.toLowerCase().includes(w))) : [];
  return (titled.length ? titled : all).slice(0, opts.limit ?? 10);
}

/** Which of the account's apps a name means ("my BikeFix app"): the app's own name or the project name, matched like matchName. */
export function matchApp<T extends { id: string; name: string; appName?: string }>(apps: T[], name: string | undefined): { id: string } | { choices: T[] } {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const n = norm(name ?? "");
  if (!n) return apps.length === 1 ? { id: apps[0].id } : { choices: apps };
  const names = (a: T) => [a.appName ?? "", a.name].map(norm).filter(Boolean);
  for (const test of [(x: string) => x === n, (x: string) => x.startsWith(n), (x: string) => x.includes(n) || (x.length > 2 && n.includes(x))]) {
    const hit = apps.filter((a) => names(a).some(test));
    if (hit.length === 1) return { id: hit[0].id };
    if (hit.length > 1) return { choices: hit };
  }
  return { choices: apps };
}

/**
 * The part of a pending draft the owner can rewrite before approving, and the field the approvals route takes for it (the same
 * limits the server applies): an email's body, a Slack or social post's text. Calendar events and other actions are approve-as-is.
 */
export function editableDraft(a: OutboundAction): { key: "body" | "text"; value: string; max: number; label: string } | null {
  if (a.type === "email.send") return { key: "body", value: a.body, max: 10000, label: "Email" };
  if (a.type === "slack.post") return { key: "text", value: a.text, max: 5000, label: "Slack message" };
  if (a.type === "social.schedule") return { key: "text", value: a.text, max: 5000, label: "Post" };
  return null;
}

/** The approve request with the owner's edit, or none when the text is unchanged or emptied (an empty draft is never sent). */
export function approveBody(a: OutboundAction, edited: string | null): { decision: "approve"; edits?: { body?: string; text?: string } } {
  const f = editableDraft(a);
  const v = edited?.trim() ?? "";
  if (!f || !v || v === f.value.trim()) return { decision: "approve" };
  return { decision: "approve", edits: { [f.key]: v.slice(0, f.max) } };
}

export type OrderRow = { id: string; productName: string; amount: number; currency: string; status: "pending" | "paid" | "cancelled" | "refunded"; customerEmail: string | null; createdAt: string; refundedAmount?: number; disputedAt?: string | null };
export type OrderFilter = "all" | "paid" | "pending" | "refunded";

/** Counts per filter and the paid total (net of partial refunds) in the most common currency, for the Orders card. */
export function orderSummary(orders: OrderRow[]): { counts: Record<OrderFilter, number>; net: number; currency: string } {
  const counts: Record<OrderFilter, number> = { all: orders.length, paid: 0, pending: 0, refunded: 0 };
  const byCur = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "paid") counts.paid++;
    else if (o.status === "pending") counts.pending++;
    if (o.status === "refunded" || (o.refundedAmount ?? 0) > 0) counts.refunded++;
    byCur.set(o.currency, (byCur.get(o.currency) ?? 0) + 1);
  }
  const currency = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";
  const net = orders.filter((o) => o.status === "paid" && o.currency === currency).reduce((n, o) => n + o.amount - (o.refundedAmount ?? 0), 0);
  return { counts, net, currency };
}

export function filterOrders(orders: OrderRow[], f: OrderFilter): OrderRow[] {
  if (f === "all") return orders;
  if (f === "refunded") return orders.filter((o) => o.status === "refunded" || (o.refundedAmount ?? 0) > 0);
  return orders.filter((o) => o.status === f);
}

/** Upper bounds the chat card offers for an agent's own caps (the server takes any number from 0; these keep typos sane). */
export const CAP_MAX = { runsPerDay: 96, outboundPerDay: 200, spendUsdPerMonth: 500 } as const;
type CapKey = keyof typeof CAP_MAX;

/** The caps that changed, as numbers within CAP_MAX, or null when nothing valid changed. */
export function capsPatch(cur: Partial<Record<CapKey, number>> | undefined, form: Record<CapKey, string>): Partial<Record<CapKey, number>> | null {
  const out: Partial<Record<CapKey, number>> = {};
  for (const k of Object.keys(CAP_MAX) as CapKey[]) {
    const raw = form[k].trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    const v = Math.min(CAP_MAX[k], k === "spendUsdPerMonth" ? Math.round(n * 100) / 100 : Math.floor(n));
    if (v !== cur?.[k]) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
