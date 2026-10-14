"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/kit";
import s from "./limit-extensions.module.css";

type Pack = { id: string; label: string; credits: number; priceUsd: number | null };
type Offer = { eligible: boolean; available: boolean; validDays: number; packs: Pack[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
/** Only ever leave for Whop's own domain, even if the server answer were wrong. */
const isWhop = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && (x.hostname === "whop.com" || x.hostname.endsWith(".whop.com"));
  } catch {
    return false;
  }
};

/**
 * "Buy more" on the limit-reached card (paid plans). Packs come from the server only when Whop checkout and the pack's plan id are
 * configured; otherwise it says extensions are not on sale yet. Free is told plainly why there is nothing to buy (it uses free models only).
 */
export function ExtensionOffer({ plan }: { plan: "free" | "lite" | "plus" | "pro" | "business" }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  useEffect(() => {
    if (plan === "free" || plan === "business") return;
    let live = true;
    fetch("/api/billing/extensions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Offer>) : null))
      .then((o) => live && setOffer(o))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [plan]);

  if (plan === "business") return null;
  if (plan === "free") {
    return (
      <p className={s.note} data-extension="free">
        Extra credits are for paid plans. Free uses free models only, so there&rsquo;s nothing to add here. Upgrading is how you keep going today.
      </p>
    );
  }
  if (!offer || !offer.eligible) return null;
  if (!offer.available || offer.packs.length === 0) {
    return (
      <p className={s.note} data-extension="unavailable">
        Extra credits aren&rsquo;t on sale yet. You can upgrade to keep going now, or wait for the reset.
      </p>
    );
  }

  async function buy(pack: Pack) {
    setBusy(pack.id);
    setError(null);
    try {
      const r = await fetch("/api/billing/extensions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack: pack.id }) });
      const j = (await r.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!r.ok || !j?.url || !isWhop(j.url)) throw new Error(j?.error ?? "Checkout couldn't start. Please try again.");
      window.location.assign(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout couldn't start. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className={s.offer} data-extension="available">
      <Button variant="primary" className={s.buy} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
        Buy more
      </Button>
      {open ? (
        <div id={listId} className={s.packs} role="group" aria-label="Extension packs">
          {offer.packs.map((p) => (
            <button key={p.id} type="button" className={s.pack} data-pack={p.id} disabled={busy !== null} onClick={() => void buy(p)}>
              <span className={s.packName}>{p.label}</span>
              <span className={s.packCredits}>{fmt(p.credits)} credits</span>
              <span className={s.packPrice}>{p.priceUsd ? money(p.priceUsd) : "Price at checkout"}</span>
              {busy === p.id ? <span className={s.packBusy}>Opening checkout…</span> : null}
            </button>
          ))}
          <p className={s.fine}>
            One-time purchase, no subscription. Credits are used only after your plan&rsquo;s limit is reached, and last {offer.validDays} days.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
