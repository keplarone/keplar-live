"use client";
import { clearAccountCaches } from "@/components/app-ui/state/scope";

/**
 * Sign out of Keplar Business on this device: business.keplar.one and the Business desktop app, which shows the same pages.
 * Every Business session in this browser is revoked on the server (signout_all on /api/account/accounts), not only forgotten,
 * and its cookies are cleared. keplar.one's own session is a separate, host-only cookie, so Keplar One stays signed in.
 * Afterwards the desktop app lands on the workspace's signed-out screen (its own Sign in button); a browser on the storefront.
 * Returns false when the server didn't confirm, so the caller can say so instead of pretending the session ended.
 */
export async function signOutOfBusiness(): Promise<boolean> {
  const res = await fetch("/api/account/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout_all" }), cache: "no-store", credentials: "same-origin" }).catch(() => null);
  if (!res?.ok) return false;
  clearAccountCaches();
  const desktop = document.documentElement.getAttribute("data-desktop") === "1";
  window.location.assign(desktop ? "/work" : "/");
  return true;
}

export const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";
