"use client";

/**
 * Account → Embed (beta). Create widgets, copy paste-ready snippet, set origin allowlist, revoke.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import s from "./account.module.css";

type Policy = { available: boolean; maxWidgets: number; perMinute: number; perDay: number };
type Widget = {
  id: string; name: string; theme: string; size: string; accent: string; models: string;
  origins: string[]; createdAt: string; revokedAt: string | null; requests: number; credits: number; snippet: string;
};
type Me = {
  plan: string; available: boolean; policy: Policy; statement: string;
  options: { themes: string[]; sizes: string[]; accents: string[]; models: string[] };
  widgets: Widget[]; scriptUrl: string;
};

const SIZE_HINT: Record<string, string> = { compact: "360×420", standard: "420×560", tall: "420×720" };

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(path, { method, cache: "no-store", credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "That didn't work.");
  return j;
}

export function EmbedPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("dark");
  const [size, setSize] = useState("standard");
  const [accent, setAccent] = useState("graphite");
  const [models, setModels] = useState("free");
  const [origins, setOrigins] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>("/api/embed");
      setMe(m);
      if (m.options.models.length === 1) setModels(m.options.models[0]!);
      else if (!m.options.models.includes(models)) setModels(m.options.models[0] ?? "plan");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [models]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!me) return err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : <p className={s.note}>Loading…</p>;
  const live = me.widgets.filter((w) => !w.revokedAt);
  const parseOrigins = () => origins.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

  return (
    <div data-embed-panel="">
      <p className={s.note}>{me.statement} Docs: <Link className={s.link} href="/developers#embed">/developers</Link></p>
      {!me.available ? (
        <p className={s.note}>Embed widgets aren&apos;t available on the {me.plan} plan.</p>
      ) : (
        <>
          <div className={s.panel}>
            <div className={s.row}><span className={s.k}>Your plan allows</span><span className={s.v}>{me.policy.maxWidgets} widgets · {me.policy.perMinute}/min · {me.policy.perDay.toLocaleString("en-US")}/day per widget</span></div>
          </div>
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api("/api/embed", "POST", { name, theme, size, accent, models, origins: parseOrigins() });
                setName(""); setOrigins("");
                await load();
              });
            }}
          >
            <label className={s.fieldLabel} htmlFor="emb-name">Widget name</label>
            <input spellCheck={false} id="emb-name" className={s.input} value={name} maxLength={40} required placeholder="Docs site" onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <label className={s.fieldLabel} htmlFor="emb-theme">Theme</label>
            <select id="emb-theme" className={s.input} value={theme} onChange={(e) => setTheme(e.target.value)}>
              {me.options.themes.map((t) => <option key={t} value={t}>{t === "dark" ? "Dark (default)" : "Light"}</option>)}
            </select>
            <label className={s.fieldLabel} htmlFor="emb-size">Size</label>
            <select id="emb-size" className={s.input} value={size} onChange={(e) => setSize(e.target.value)}>
              {me.options.sizes.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}{SIZE_HINT[t] ? ` · ${SIZE_HINT[t]}` : ""}</option>)}
            </select>
            <label className={s.fieldLabel} htmlFor="emb-accent">Accent</label>
            <select id="emb-accent" className={s.input} value={accent} onChange={(e) => setAccent(e.target.value)}>
              {me.options.accents.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
            </select>
            {me.options.models.length > 1 ? (
              <>
                <label className={s.fieldLabel} htmlFor="emb-models">Models</label>
                <select id="emb-models" className={s.input} value={models} onChange={(e) => setModels(e.target.value)}>
                  <option value="free">Free open models only</option>
                  <option value="plan">Your plan&apos;s models (uses your credits)</option>
                </select>
              </>
            ) : <p className={s.note}>Free plan widgets always use OpenRouter :free models.</p>}
            <label className={s.fieldLabel} htmlFor="emb-origins">Allowed origins (optional)</label>
            <textarea id="emb-origins" className={s.input} style={{ height: 72, padding: "10px 12px" }} value={origins} placeholder={"https://example.com\nhttps://docs.example.com"} onChange={(e) => setOrigins(e.target.value)} />
            <p className={s.note}>Leave empty to allow any site (still rate-limited). One origin per line.</p>
            <div className={s.actions}><button type="submit" className={`${s.btn} ${s.btnSm}`} disabled={busy || live.length >= me.policy.maxWidgets}>Create widget</button></div>
          </form>
        </>
      )}
      {err ? <p className={`${s.note} ${s.err}`} role="alert">{err}</p> : null}
      {live.length ? (
        <ul className={s.sessions} aria-label="Your embed widgets">
          {live.map((w) => (
            <li key={w.id} className={s.session}>
              <span className={s.sessionInfo}>
                <strong>{w.name}</strong>
                <span className={s.sub}>{w.id} · {w.theme}/{w.size}/{w.accent} · {w.models} models · {w.requests} asks · {w.origins.length ? w.origins.join(", ") : "any origin"}</span>
              </span>
              <div className={s.actions}>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnSm}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(w.snippet).then(() => setCopied(w.id)).catch(() => setErr("Couldn't copy. Select the snippet and copy by hand."));
                  }}
                >
                  {copied === w.id ? "Copied" : "Copy snippet"}
                </button>
                <a className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} href={`/embed?id=${w.id}&theme=${w.theme}&accent=${w.accent}&parent=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`} target="_blank" rel="noopener">Preview</a>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                  disabled={busy}
                  onClick={() => void act(async () => { await api(`/api/embed/${w.id}`, "DELETE"); await load(); })}
                >
                  Revoke
                </button>
              </div>
              <pre className={s.pre} tabIndex={0} aria-label={`Embed snippet for ${w.name}`}>{w.snippet}</pre>
            </li>
          ))}
        </ul>
      ) : me.available ? <p className={s.note}>No widgets yet. Create one to get a paste-ready script tag.</p> : null}
    </div>
  );
}
