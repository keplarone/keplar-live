"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WhopEmbed, type EmbedConfig } from "./WhopEmbed";
import s from "@/components/account/account.module.css";

type Props = { plan: "lite" | "plus" | "pro"; name: string; price: number; ready: boolean; embed?: EmbedConfig | null };

/** Starts the Whop checkout for the chosen plan as soon as the page opens (one POST, then redirect). */
export function CheckoutStart({ plan, name, price, ready, embed }: Props) {
  const [useHosted, setUseHosted] = useState(false);
  const embedded = Boolean(embed) && !useHosted;
  const [state, setState] = useState<"idle" | "opening" | "error" | "soon">(embed ? "idle" : ready ? "opening" : "soon");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const router = useRouter();

  async function start() {
    setState("opening");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string; configured?: boolean; code?: string };
      if (res.status === 401 || j.code === "unauthenticated") {
        router.push(`/signin?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`);
        return;
      }
      if (res.status === 503 && j.configured === false) return setState("soon");
      if (!res.ok || !j.url) throw new Error(j.error || "Checkout couldn't start. Please try again.");
      window.location.assign(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout couldn't start. Please try again.");
      setState("error");
    }
  }

  useEffect(() => {
    if (embedded || !ready || started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  if (embedded && embed) {
    return (
      <div className={s.form}>
        <p className={s.lead}>{name} · ${price}/month, plus any tax shown in the form. Billed monthly through Whop; the exact amount is shown at checkout before you pay. Cancel any time from your account.</p>
        <WhopEmbed
          config={embed}
          planName={name}
          onPaid={() => {
            // Webhooks grant the plan; this just nudges a refresh and returns to the account page.
            void fetch("/api/billing/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined).finally(() => router.push("/account?checkout=success"));
          }}
          onFallback={ready ? () => { started.current = false; setUseHosted(true); setState("opening"); void start(); } : undefined}
        />
        <p className={s.note}>Payment is handled by Whop inside the form above; Keplar never sees your card. <Link className={s.link} href="/pricing">Back to pricing</Link></p>
      </div>
    );
  }
  if (state === "soon") {
    return (
      <div className={s.form}>
        <p className={s.lead} role="status">Checkout opens soon. Nothing was charged.</p>
        <div className={s.actions}>
          <Link className={s.btn} href="/pricing">Back to pricing</Link>
        </div>
      </div>
    );
  }
  return (
    <div className={s.form}>
      <p className={s.lead} role="status" aria-live="polite">
        {state === "opening" ? `Opening secure checkout for ${name} ($${price}/month)…` : null}
      </p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      <div className={s.actions}>
        <button type="button" className={s.btn} onClick={() => void start()} disabled={state === "opening"}>
          {state === "opening" ? "Opening…" : `Continue to checkout · $${price}/mo`}
        </button>
        <Link className={`${s.btn} ${s.btnGhost}`} href="/pricing">Back to pricing</Link>
      </div>
      <p className={s.note}>Payment is handled by Whop. You can manage or cancel any time from your account.</p>
    </div>
  );
}
