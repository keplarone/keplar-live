"use client";
/** The Data (backend browser) and Settings panes of an app. Loaded only when one of those tabs is opened. */
import { useEffect, useState } from "react";
import { api } from "../api";
import s from "./studio.module.css";
import type { AppDetail } from "./types";
import { Button, SegmentedControl } from "@/components/kit";

export function DataPane({ id }: { id: string }) {
  const [env, setEnv] = useState<"draft" | "live">("draft");
  const [col, setCol] = useState("");
  const [data, setData] = useState<{ collections: { name: string; label: string; count: number }[]; users: number; files: { count: number; bytes: number }; ai: { calls30d: number }; records: { id: string; owner: string; createdAt: string; data: unknown }[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<typeof data>(`/api/apps/${id}/data?env=${env}${col ? `&col=${encodeURIComponent(col)}` : ""}`).then(setData, (e) => setErr((e as Error).message));
  }, [id, env, col]);
  return (
    <div className={s.pane}>
      <div className={s.paneHead}>
        <h2 className={s.paneTitle}>Backend</h2>
        <span className={s.grow} />
        <SegmentedControl label="Environment" size="sm" value={env} onValueChange={setEnv} options={[{ value: "draft", label: "Preview data" }, { value: "live", label: "Live data" }]} />
      </div>
      {err ? <div className={s.paneMsg} role="alert">{err}</div> : null}
      {data ? (
        <>
          <p className={s.paneMeta}>{data.users} account{data.users === 1 ? "" : "s"} · {data.files.count} file{data.files.count === 1 ? "" : "s"} ({Math.round(data.files.bytes / 1024)} KB) · {data.ai.calls30d} AI calls in 30 days</p>
          <table className={s.table}>
            <thead><tr><th>Collection</th><th>Records</th><th /></tr></thead>
            <tbody>{data.collections.map((c) => <tr key={c.name}><td>{c.label} <span className={s.dim}>({c.name})</span></td><td>{c.count}</td><td><Button variant="ghost" size="sm" onClick={() => setCol(c.name)}>View</Button></td></tr>)}</tbody>
          </table>
          {col ? (
            <table className={s.table}>
              <thead><tr><th>Record</th><th>Data</th></tr></thead>
              <tbody>{data.records.map((r) => <tr key={r.id}><td><span className={s.dim}>{new Date(r.createdAt).toLocaleString()}</span><br />{r.owner === "seed" ? "example" : r.owner}</td><td><pre className={s.rec}>{JSON.stringify(r.data, null, 1)}</pre></td></tr>)}</tbody>
            </table>
          ) : null}
        </>
      ) : !err ? <p className={s.paneMeta}>Loading…</p> : null}
    </div>
  );
}

export function SettingsPane({ app, onSaved }: { app: AppDetail; onSaved: () => void }) {
  const [settings, setSettings] = useState(app.settings ?? { signups: true, ai: true, uploads: true });
  const [admins, setAdmins] = useState(app.admins.join(", "));
  const [msg, setMsg] = useState("");
  const save = async () => {
    try {
      await api(`/api/apps/${app.id}`, { method: "PATCH", body: JSON.stringify({ settings, admins: admins.split(/[\s,]+/).filter(Boolean) }) });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className={s.pane}>
      <h2 className={s.paneTitle}>App settings</h2>
      <label className={s.switch}><input type="checkbox" checked={settings.signups} onChange={(e) => setSettings({ ...settings, signups: e.target.checked })} />New people can create accounts</label>
      <label className={s.switch}><input type="checkbox" checked={settings.uploads} onChange={(e) => setSettings({ ...settings, uploads: e.target.checked })} />File and photo uploads</label>
      <label className={s.switch}><input type="checkbox" checked={settings.ai} onChange={(e) => setSettings({ ...settings, ai: e.target.checked })} />AI features (each call uses your credits)</label>
      <label className={s.field}><span>Admins (sign in to the app with these emails to get admin screens)</span><input className={s.input} value={admins} onChange={(e) => setAdmins(e.target.value)} /></label>
      <div className={s.paneHead}><Button variant="primary" size="sm" onClick={save}>Save</Button><span className={s.paneMeta}>{msg}</span></div>
      {app.spec?.schedules?.length ? (
        <>
          <h2 className={s.paneTitle}>Runs by itself</h2>
          <p className={s.paneMeta}>Once published, the app runs these on its own and saves the result as a new record. Each run uses AI credits like a visitor&apos;s request, and stops when AI features are off.</p>
          <ul className={s.paneMeta}>{app.spec.schedules.map((j) => <li key={j.name}>{j.label} · every {j.every}</li>)}</ul>
        </>
      ) : null}
      <h2 className={s.paneTitle}>Incoming webhooks</h2>
      {app.hooks?.length ? (
        <>
          <p className={s.paneMeta}>Other services (forms, Stripe, Zapier, your own scripts) can add records to the published app with a POST of JSON to these addresses. Each one opens a single collection; keep them secret.</p>
          {app.hooks.map((h) => (
            <label key={h.collection} className={s.field}>
              <span>{h.label}</span>
              <span className={s.hookRow}>
                <input className={s.input} readOnly value={h.url} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard?.writeText(h.url); setMsg(`Copied the ${h.label} webhook.`); }}>Copy</Button>
              </span>
            </label>
          ))}
        </>
      ) : <p className={s.paneMeta}>Publish the app to get a webhook address for each of its collections.</p>}
    </div>
  );
}
