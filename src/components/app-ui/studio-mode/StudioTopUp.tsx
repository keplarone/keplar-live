"use client";

import { useEffect, useState } from "react";
import s from "./studio-mode.module.css";

type State = { enabled: boolean; choice: { credits: number; priceUsd: number; monthlyLimit: number; methodLabel: string } | null };
type Quote = { quoteId: string; offers: { pack: string; label: string; credits: number; priceUsd: number; validDays: number }[]; methods: { id: string; label: string }[]; custom?: { creditsPerUsd: number; minUsd: number; maxUsd: number } | null };
const money = (usd: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);
const endpoint = "/api/billing/studio-topup";

async function request<T>(url: string, data?: unknown): Promise<T> {
  const r = await fetch(url, data === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Auto top-up could not be updated.");
  return result as T;
}

/** Shared by the full Studio page and the desktop overlay. Enabling never charges immediately. */
export function StudioTopUp() {
  const [state, setState] = useState<State | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pack, setPack] = useState("");
  const [method, setMethod] = useState("");
  const [limit, setLimit] = useState(1);
  const [amount, setAmount] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => { void request<State>(endpoint).then((v) => { if (live) setState(v); }).catch((e: Error) => { if (live) setError(e.message); }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("focus", refresh); };
  }, []);

  const setup = async (customAmount?: string) => {
    setBusy(true); setError(""); setConsent(false);
    try {
      const q = await request<Quote>(`${endpoint}?setup=1${customAmount === undefined ? "" : `&amount=${encodeURIComponent(customAmount)}`}`);
      setQuote(q); setPack(q.offers[0]?.pack ?? ""); setMethod(q.methods[0]?.id ?? "");
      setAmount(String(q.offers.find((p) => p.pack === "custom")?.priceUsd ?? ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load payment details."); }
    finally { setBusy(false); }
  };
  const save = async (enabled: boolean) => {
    setBusy(true); setError("");
    try {
      setState(await request<State>(endpoint, { enabled, ...(enabled ? { quoteId: quote?.quoteId, pack, methodId: method, monthlyLimit: limit } : {}) }));
      setQuote(null); setConsent(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save auto top-up."); }
    finally { setBusy(false); }
  };
  const chosen = quote?.offers.find((p) => p.pack === pack && (pack !== "custom" || p.priceUsd === Number(amount)));
  return (
    <details className={s.topup}>
      <summary>Auto top-up <span>{state ? state.enabled ? "On" : "Off" : error ? "Unavailable" : "Loading…"}</span></summary>
      <div className={s.topupBody}>
        <p>Add credits automatically when Studio runs out, then continue building. Charges only happen during a Studio run.</p>
        {state?.enabled && state.choice ? <p>{state.choice.credits.toLocaleString()} credits per top-up at {money(state.choice.priceUsd)} USD, plus applicable tax and Whop fees, using {state.choice.methodLabel}. Up to {state.choice.monthlyLimit} top-up{state.choice.monthlyLimit === 1 ? "" : "s"} per calendar month (UTC). You can turn this off at any time.</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {quote ? (
          <form onSubmit={(e) => { e.preventDefault(); if (consent) void save(true); }}>
            <label>Top-up amount<select value={pack} disabled={busy} onChange={(e) => { setPack(e.target.value); setConsent(false); }}>{quote.offers.map((p) => <option key={p.pack} value={p.pack}>{p.pack === "custom" ? "Custom dollar amount" : `${p.credits.toLocaleString()} credits · ${money(p.priceUsd)} USD`}</option>)}</select></label>
            {pack === "custom" && quote.custom ? <>
              <label>Amount per top-up (USD)<input type="number" inputMode="decimal" min={quote.custom.minUsd} max={quote.custom.maxUsd} step="0.01" value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value); setConsent(false); }} /></label>
              <p>{quote.custom.creditsPerUsd.toLocaleString()} credits per $1 USD. Choose ${quote.custom.minUsd}–${quote.custom.maxUsd} per top-up.</p>
              {!chosen ? <button className={s.ghost} type="button" disabled={busy || !amount} onClick={() => void setup(amount)}>Review amount</button> : <p>{chosen.credits.toLocaleString()} credits for {money(chosen.priceUsd)} USD.</p>}
            </> : null}
            <label>Saved card<select value={method} disabled={busy} onChange={(e) => { setMethod(e.target.value); setConsent(false); }}>{quote.methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            <label>Maximum top-ups per month<select value={limit} disabled={busy} onChange={(e) => { setLimit(Number(e.target.value)); setConsent(false); }}>{[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            {chosen ? <>
              <p>At this setting: up to {money(chosen.priceUsd * limit)} USD in top-ups per calendar month (UTC), plus applicable tax and Whop fees. Credits expire after {chosen.validDays} days. Turning this off stops future charges; a payment already started can still complete.</p>
              <label className={s.topupConsent}><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} /><span>I authorize Keplar to charge my selected saved card {money(chosen.priceUsd)} USD, plus applicable tax and Whop fees, for {chosen.credits.toLocaleString()} credits whenever Studio needs more credits, up to {limit} time{limit === 1 ? "" : "s"} per month, until I turn this off.</span></label>
            </> : null}
            <div className={s.topupActions}><button className={s.primary} type="submit" disabled={busy || !consent || !chosen || !method}>{busy ? "Saving…" : "Enable auto top-up"}</button><button className={s.ghost} type="button" disabled={busy} onClick={() => { setQuote(null); setConsent(false); }}>Cancel</button></div>
          </form>
        ) : <button className={s.ghost} type="button" disabled={busy} onClick={() => void setup()}>{busy ? "Loading…" : state?.enabled ? "Change auto top-up" : "Set up auto top-up"}</button>}
        {state?.enabled ? <button className={s.ghost} type="button" disabled={busy} onClick={() => void save(false)}>Turn off auto top-up</button> : null}
      </div>
    </details>
  );
}
