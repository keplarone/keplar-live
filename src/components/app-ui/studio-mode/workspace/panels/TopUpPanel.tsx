"use client";
/**
 * Auto top-up (full page and overlay; rendered inside a Dialog titled "Auto top-up"). The behaviour of StudioTopUp.tsx,
 * unchanged: state from GET /api/billing/studio-topup (refreshed on mount and on window focus); a quote from ?setup=1
 * (&amount= for a custom dollar amount, "Review amount"); pack, saved card and monthly maximum; the explicit consent
 * checkbox, reset by every field change; Enable only with consent, a matched offer and a card; Turn off. Enabling never
 * charges immediately; charges only happen during a Studio run (the run loop's recharge call).
 */
import { useEffect, useId, useState } from "react";
import { Badge, Button, Icon } from "../../ui";
import {
  canEnableTopUp, chosenOffer, money, offerLabel, TOPUP_ENDPOINT, TOPUP_LIMITS, topUpConsent, topUpMonthly, topUpStatus, topUpSummary,
  type TopUpQuote, type TopUpState,
} from "./panel-logic";
import s from "./panels.module.css";

async function request<T>(url: string, data?: unknown): Promise<T> {
  const r = await fetch(url, data === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Auto top-up could not be updated.");
  return result as T;
}

export type TopUpPanelProps = { compact?: boolean };

export function TopUpPanel({ compact = false }: TopUpPanelProps) {
  const [state, setState] = useState<TopUpState | null>(null);
  const [quote, setQuote] = useState<TopUpQuote | null>(null);
  const [pack, setPack] = useState("");
  const [method, setMethod] = useState("");
  const [limit, setLimit] = useState(1);
  const [amount, setAmount] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const id = useId();

  useEffect(() => {
    let live = true;
    const refresh = () => { void request<TopUpState>(TOPUP_ENDPOINT).then((v) => { if (live) setState(v); }).catch((e: Error) => { if (live) setError(e.message); }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("focus", refresh); };
  }, []);

  const setup = async (customAmount?: string) => {
    setBusy(true); setError(""); setSaved(""); setConsent(false);
    try {
      const q = await request<TopUpQuote>(`${TOPUP_ENDPOINT}?setup=1${customAmount === undefined ? "" : `&amount=${encodeURIComponent(customAmount)}`}`);
      setQuote(q); setPack(q.offers[0]?.pack ?? ""); setMethod(q.methods[0]?.id ?? "");
      setAmount(String(q.offers.find((p) => p.pack === "custom")?.priceUsd ?? ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load payment details."); }
    finally { setBusy(false); }
  };
  const save = async (enabled: boolean) => {
    setBusy(true); setError(""); setSaved("");
    try {
      setState(await request<TopUpState>(TOPUP_ENDPOINT, { enabled, ...(enabled ? { quoteId: quote?.quoteId, pack, methodId: method, monthlyLimit: limit } : {}) }));
      setQuote(null); setConsent(false);
      setSaved(enabled ? "Auto top-up is on." : "Auto top-up is off.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save auto top-up."); }
    finally { setBusy(false); }
  };

  const chosen = chosenOffer(quote, pack, amount);
  const status = topUpStatus(state, error);
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setConsent(false); };

  return (
    <div className={s.stack} data-compact={compact ? "" : undefined}>
      <div className={s.row}>
        <Badge tone={status.tone}>{status.label}</Badge>
        <p className={`${s.line} ${s.grow}`}>Add credits automatically when Studio runs out, then continue building. Charges only happen during a Studio run.</p>
      </div>

      {state?.enabled && state.choice ? <p className={s.meta}>{topUpSummary(state.choice)}</p> : null}
      {error ? <p className={s.notice} data-tone="danger" role="alert"><Icon name="error" size={14} />{error}</p> : null}
      {saved ? <p className={s.notice} data-tone="success" role="status"><Icon name="check" size={14} />{saved}</p> : null}

      {quote ? (
        <form className={s.stack} onSubmit={(e) => { e.preventDefault(); if (consent) void save(true); }} aria-label="Set up auto top-up">
          <div className={s.form} data-single={compact ? "" : undefined}>
            <label className={s.field} data-wide="">
              <span className={s.fieldLabel}>Top-up amount</span>
              <select className={s.control} value={pack} disabled={busy} onChange={(e) => change(setPack)(e.target.value)}>
                {quote.offers.map((p) => <option key={p.pack} value={p.pack}>{offerLabel(p)}</option>)}
              </select>
            </label>
            {pack === "custom" && quote.custom ? (
              <div className={s.field} data-wide="">
                <label className={s.field}>
                  <span className={s.fieldLabel}>Amount per top-up (USD)</span>
                  <input className={s.control} type="number" inputMode="decimal" min={quote.custom.minUsd} max={quote.custom.maxUsd} step="0.01" value={amount} disabled={busy} onChange={(e) => change(setAmount)(e.target.value)} />
                </label>
                <p className={s.meta}>{quote.custom.creditsPerUsd.toLocaleString()} credits per $1 USD. Choose ${quote.custom.minUsd}–${quote.custom.maxUsd} per top-up.</p>
                {!chosen
                  ? <span><Button size="sm" disabled={busy || !amount} onClick={() => void setup(amount)}>Review amount</Button></span>
                  : <p className={s.meta}><span className={s.strong}>{chosen.credits.toLocaleString()} credits for {money(chosen.priceUsd)} USD.</span></p>}
              </div>
            ) : null}
            <label className={s.field}>
              <span className={s.fieldLabel}>Saved card</span>
              <select className={s.control} value={method} disabled={busy} onChange={(e) => change(setMethod)(e.target.value)}>
                {quote.methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Maximum top-ups per month</span>
              <select className={s.control} value={limit} disabled={busy} onChange={(e) => change(setLimit)(Number(e.target.value))}>
                {TOPUP_LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          {chosen ? (
            <>
              <p className={s.meta}>{topUpMonthly(chosen, limit)}</p>
              <label className={s.consent} data-checked={consent ? "" : undefined} htmlFor={`${id}-consent`}>
                <input id={`${id}-consent`} type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
                <span>{topUpConsent(chosen, limit)}</span>
              </label>
            </>
          ) : null}
          <div className={s.row}>
            <Button variant="primary" type="submit" loading={busy} disabled={!canEnableTopUp({ consent, chosen, method, busy })}>{busy ? "Saving…" : "Enable auto top-up"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setQuote(null); setConsent(false); }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className={s.row}>
          <Button variant={state?.enabled ? "secondary" : "primary"} loading={busy} disabled={busy} onClick={() => void setup()}>{busy ? "Loading…" : state?.enabled ? "Change auto top-up" : "Set up auto top-up"}</Button>
          {state?.enabled ? <Button variant="ghost" disabled={busy} onClick={() => void save(false)}>Turn off auto top-up</Button> : null}
        </div>
      )}
      {quote && state?.enabled ? (
        <div className={s.row}><Button variant="ghost" size="sm" disabled={busy} onClick={() => void save(false)}>Turn off auto top-up</Button></div>
      ) : null}
    </div>
  );
}
