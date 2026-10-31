"use client";
import { useEffect, useState } from "react";
import { SIGNED_KEY } from "@/lib/signed-hint";
import { activeScope } from "@/components/app-ui/state/scope";

export type PlanInfo = { ready: boolean; plan: "free" | "lite" | "plus" | "pro" | "business"; signedIn: boolean; admin: boolean; checkout: boolean; liteCheckout: boolean };

const FREE: PlanInfo = { ready: false, plan: "free", signedIn: false, admin: false, checkout: true, liteCheckout: false };
const FAILED: PlanInfo = { ...FREE, ready: true };
/** Keyed by the app's scope (state/scope.ts), so a different account signed in on the same page load is asked again. */
let cached: { scope: string; p: Promise<PlanInfo> } | undefined;

type ComputeBody = { plan?: PlanInfo["plan"]; signedIn?: boolean; admin?: boolean; checkout?: boolean; liteCheckout?: boolean } & Record<string, unknown>;
let computeInflight: { at: number; lite: boolean; p: Promise<ComputeBody | null> } | null = null;

/**
 * One in-flight GET /api/compute. Callers that start within a short window share it (nav plan + the chat meter).
 * `lite`: only the plan and sign-in state are needed (the nav): signed out, the server answers without reading the meter from the
 * database. A lite caller may share a full request; a full caller never shares a lite one.
 */
export function fetchCompute(fresh = false, lite = false): Promise<ComputeBody | null> {
  const now = Date.now();
  if (!fresh && computeInflight && now - computeInflight.at < 2000 && (lite || !computeInflight.lite)) return computeInflight.p;
  const p = fetch(lite ? "/api/compute?lite=1" : "/api/compute", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<ComputeBody>) : null))
    .catch((): null => null);
  computeInflight = { at: now, lite, p };
  return p;
}

/** Remember the session state for the next page load (signed-hint.ts) and switch the "Try Keplar" labels to "Open Keplar" right now. */
function remember(i: PlanInfo): PlanInfo {
  if (i === FAILED) return i; // an unreachable server says nothing about the session
  try { localStorage.setItem(SIGNED_KEY, i.signedIn ? "1" : "0"); } catch { /* private mode */ }
  if (i.signedIn) document.documentElement.setAttribute("data-signed", "1"); else document.documentElement.removeAttribute("data-signed");
  return i;
}

/** One small request per page load (and account); marketing pages stay static. Failures fall back to Free/signed-out. */
function load(): Promise<PlanInfo> {
  const scope = activeScope();
  if (cached?.scope === scope) return cached.p;
  // A different account from the cached answer: never share a request that may have started for the previous one.
  const p = fetchCompute(cached !== undefined, true)
    .then((m): PlanInfo => (!m ? FAILED : {
      ready: true,
      plan: m?.plan === "lite" || m?.plan === "plus" || m?.plan === "pro" || m?.plan === "business" ? m.plan : "free",
      signedIn: Boolean(m?.signedIn),
      admin: Boolean(m?.admin),
      checkout: m ? m.checkout !== false : true,
      liteCheckout: Boolean(m?.liteCheckout),
    }))
    .catch((): PlanInfo => FAILED)
    .then(remember);
  cached = { scope, p };
  return p;
}

export function usePlan(): PlanInfo {
  const [info, setInfo] = useState<PlanInfo>(FREE);
  useEffect(() => {
    let on = true;
    void load().then((i) => on && setInfo(i));
    return () => {
      on = false;
    };
  }, []);
  return info;
}

export const isPaid = (p: PlanInfo) => p.plan === "lite" || p.plan === "plus" || p.plan === "pro" || p.plan === "business";
