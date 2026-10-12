"use client";

import { useEffect, useState } from "react";

/** The account's live numbers (GET /api/business/dashboard): only real data, from what the company connected. */
export type Pulse = {
  revenue: { last30: number; total: number; refunded: number };
  orders: { last30: number; pending: number };
  leads: { last30: number; total: number };
  traffic: { last14: number; days: { day: string; views: number }[] };
  agents: { active: number; total: number; halted: boolean; recentRuns: { id: string; agentName: string; status: string; startedAt: string }[] };
  approvals: { pending: number };
  payments: unknown;
  compute: { used: number; total: number | null; resetsAt?: string };
};

const EVERY_MS = 60_000;

/**
 * The workspace's status bar and home read the same numbers: loaded once, then refreshed every minute while the window is
 * visible (a hidden tab or a minimized desktop app does not poll).
 */
export function usePulse(enabled: boolean): { pulse: Pulse | null; at: number | null } {
  const [state, setState] = useState<{ pulse: Pulse | null; at: number | null }>({ pulse: null, at: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/business/dashboard", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Pulse | null) => { if (live && d) setState({ pulse: d, at: Date.now() }); })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, EVERY_MS);
    document.addEventListener("visibilitychange", load);
    return () => { live = false; window.clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [enabled]);
  return state;
}

export const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
export const count = (x: number) => x.toLocaleString("en-US");
