"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutCurrent } from "./switch-account";
import s from "./account.module.css";

async function post(url: string, data?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/** Sign out of the current account (other signed-in accounts stay). */
export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className ?? `${s.btn} ${s.btnGhost}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOutCurrent();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function AccountActions({ plan, checkoutReady, canRefresh, canManage, admin, liteReady = false }: { plan: string; checkoutReady: boolean; canRefresh: boolean; canManage: boolean; admin: boolean; liteReady?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function go(label: string, fn: () => Promise<{ url?: string }>) {
    setBusy(label);
    setError(null);
    try {
      const { url } = await fn();
      if (url) window.location.assign(url);
      else setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setError(null);
    setNote(null);
    try {
      const r = (await post("/api/billing/sync")) as { found?: boolean };
      if (r.found) router.refresh();
      else setNote("No new payment found yet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(null);
  }

  const paid = plan === "lite" || plan === "plus" || plan === "pro";
  const manageLabel = "Manage billing & invoices";
  return (
    <div className={s.form}>
      <div className={s.actions}>
        {!paid && !admin ? (
          checkoutReady ? (
            <>
              {liteReady ? (
                <button className={`${s.btn} ${s.btnGhost}`} disabled={!!busy} onClick={() => router.push("/checkout?plan=lite")}>
                  Upgrade to Lite · $20/mo
                </button>
              ) : null}
              <button className={s.btn} disabled={!!busy} onClick={() => router.push("/checkout?plan=plus")}>
                Upgrade to Plus · $45/mo
              </button>
              <button className={`${s.btn} ${s.btnGhost}`} disabled={!!busy} onClick={() => router.push("/checkout?plan=pro")}>
                Upgrade to Pro · $99/mo
              </button>
            </>
          ) : (
            <>
              <button className={s.btn} disabled aria-disabled="true">Checkout opens soon · Plus $45/mo</button>
              <button className={`${s.btn} ${s.btnGhost}`} disabled aria-disabled="true">Checkout opens soon · Pro $99/mo</button>
            </>
          )
        ) : null}
        {plan === "lite" && !admin && checkoutReady ? (
          <button className={s.btn} disabled={!!busy} onClick={() => router.push("/checkout?plan=plus")}>
            Upgrade to Plus · $45/mo
          </button>
        ) : null}
        {plan === "plus" && !admin && checkoutReady ? (
          <button className={s.btn} disabled={!!busy} onClick={() => router.push("/checkout?plan=pro")}>
            Upgrade to Pro · $99/mo
          </button>
        ) : null}
        {canRefresh && !admin ? (
          <button className={`${s.btn} ${s.btnGhost}`} disabled={!!busy} onClick={refresh}>
            {busy === "refresh" ? "Checking…" : "Refresh plan"}
          </button>
        ) : null}
        {admin ? (
          <>
            <Link className={`${s.btn} ${s.btnGhost}`} href="/admin">Admin dashboard</Link>
            <Link className={`${s.btn} ${s.btnGhost}`} href="/admin/costs">Spend &amp; costs</Link>
          </>
        ) : null}
        {canManage ? (
          <button className={`${s.btn} ${s.btnGhost}`} disabled={!!busy} onClick={() => go("portal", () => post("/api/billing/portal"))}>
            {busy === "portal" ? "Opening…" : manageLabel}
          </button>
        ) : null}
      </div>
      {note ? <p className={s.note} role="status">{note}</p> : null}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
    </div>
  );
}
