"use client";
import { useEffect, useState } from "react";
import { SIGNED_KEY } from "@/lib/signed-hint";

export type PlanInfo = { ready: boolean; plan: "free" | "lite" | "plus" | "pro" | "business"; signedIn: boolean; admin: boolean; checkout: boolean; liteCheckout: boolean };

const FREE: PlanInfo = { ready: false, plan: "free", signedIn: false, admin: false, checkout: true, liteCheckout: false };
const FAILED: PlanInfo = { ...FREE, ready: true };
let cached: Promise<PlanInfo> | undefined;

/** Remember the session state for the next page load (signed-hint.ts) and switch the "Try Keplar" labels to "Open Keplar" right now. */
function remember(i: PlanInfo): PlanInfo {
  if (i === FAILED) return i; // an unreachable server says nothing about the session
  try { localStorage.setItem(SIGNED_KEY, i.signedIn ? "1" : "0"); } catch { /* private mode */ }
  if (i.signedIn) document.documentElement.setAttribute("data-signed", "1"); else document.documentElement.removeAttribute("data-signed");
  return i;
}

/** One small request per page load; marketing pages stay static. Failures fall back to Free/signed-out. */
function load(): Promise<PlanInfo> {
  cached ??= fetch("/api/compute", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { plan?: PlanInfo["plan"]; signedIn?: boolean; admin?: boolean; checkout?: boolean; liteCheckout?: boolean } | null): PlanInfo => (!m ? FAILED : {
      ready: true,
      plan: m?.plan === "lite" || m?.plan === "plus" || m?.plan === "pro" || m?.plan === "business" ? m.plan : "free",
      signedIn: Boolean(m?.signedIn),
      admin: Boolean(m?.admin),
      checkout: m ? m.checkout !== false : true,
      liteCheckout: Boolean(m?.liteCheckout),
    }))
    .catch((): PlanInfo => FAILED)
    .then(remember);
  return cached;
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
