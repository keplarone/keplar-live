"use client";
import { clearAccountCaches } from "@/components/app-ui/state/scope";

/**
 * Several accounts on one device (server side: src/lib/accounts/multi.ts). Every call goes to /api/account/accounts, which
 * only ever returns emails and names. After any change of who is active, every account-keyed cache in this browser is
 * wiped and the page is reloaded, so the next account loads its own plan, credits, chats, memory and onboarding from the
 * server and nothing of the previous one stays on screen.
 */
export type SavedAccount = { slot: number; email: string; name: string | null; expired: boolean };
export type AccountList = { active: { email: string; name: string | null } | null; accounts: SavedAccount[] };

const URL_ = "/api/account/accounts";

async function post(body: Record<string, unknown>) {
  const res = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ok: res.ok, json };
}

export async function fetchAccounts(): Promise<AccountList | null> {
  try {
    const res = await fetch(URL_, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as AccountList;
  } catch {
    return null;
  }
}

/** Where "Add account" goes: the normal sign-in page, in add mode (the current account stays signed in). */
export const ADD_ACCOUNT_TARGET = "/signin?next=%2Fapp&add=1";
export const signInAgainTarget = (email: string) => `/signin?next=%2Fapp&add=1&expired=${encodeURIComponent(email)}`;

export function addAccount(): void {
  clearAccountCaches();
  window.location.assign(ADD_ACCOUNT_TARGET);
}

export type SwitchOutcome = { ok: true } | { ok: false; expired: boolean; email?: string; message: string };

export async function switchToAccount(slot: number): Promise<SwitchOutcome> {
  const r = await post({ action: "switch", slot });
  if (r.ok) {
    clearAccountCaches();
    window.location.assign("/app");
    return { ok: true };
  }
  const message = typeof r.json.error === "string" ? r.json.error : "Couldn't switch accounts. Try again.";
  return { ok: false, expired: r.json.code === "expired", email: typeof r.json.email === "string" ? r.json.email : undefined, message };
}

/** Sign out the account on screen only. If another saved account is still valid it becomes active (page reloads into it). */
export async function signOutCurrent(): Promise<{ promoted: boolean }> {
  const r = await post({ action: "signout" });
  clearAccountCaches();
  const promoted = Boolean(r.ok && r.json.promoted);
  window.location.assign(promoted ? "/app" : "/");
  return { promoted };
}

export async function signOutAll(): Promise<void> {
  await post({ action: "signout_all" });
  clearAccountCaches();
  window.location.assign("/");
}

export async function removeSavedAccount(slot: number): Promise<void> {
  await post({ action: "remove", slot });
}
