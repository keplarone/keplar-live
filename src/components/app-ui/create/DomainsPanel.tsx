"use client";
/**
 * Custom domains for an app, inside the chat's Create card: the same /api/domains routes as the Create studio (list, add, Check
 * again, remove). The plan allowance, server set-up and "publish first" come from the server's listing and are said plainly; adding
 * waits for a click (even when the domain came from your words) and removing waits for a confirm.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Confirm } from "../workspace/Confirm";
import { domainGate, hostFrom, type DomainListing } from "./look-edit";
import s from "./create.module.css";

type Rec = { type: "A" | "CNAME" | "TXT"; name: string; host: string; value: string };
type Dom = { id: string; hostname: string; status: "pending" | "verifying" | "active" | "error"; apex: boolean; records: Rec[]; problems: { title?: string; fix?: string; detail?: string }[]; message: string | null; lastCheckedAt: string | null; url: string };
type Listing = Omit<DomainListing, "domains"> & { domains: Dom[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

const STATUS: Record<Dom["status"], string> = { pending: "Waiting for DNS", verifying: "Checking", active: "Connected", error: "Needs attention" };

export function DomainsPanel({ siteId, name, initial }: { siteId: string; name: string; initial?: string }) {
  const [list, setList] = useState<Listing | null>(null);
  const [err, setErr] = useState("");
  const [input, setInput] = useState(initial ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Dom | null>(null);
  const load = useCallback(() => api<Listing>(`/api/domains?siteId=${encodeURIComponent(siteId)}`).then(setList).catch((e: Error) => setErr(e.message)), [siteId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const add = () => run("add", async () => {
    await api(`/api/domains`, { method: "POST", body: JSON.stringify({ siteId, domain: hostFrom(input) }) });
    setInput("");
    await load();
  });
  const check = (d: Dom) => run(`c:${d.id}`, async () => {
    const r = await api<{ domain: Dom }>(`/api/domains/${d.id}`, { method: "POST" });
    setList((l) => (l ? { ...l, domains: l.domains.map((x) => (x.id === d.id ? r.domain : x)) } : l));
  });
  const remove = (d: Dom) => run(`r:${d.id}`, async () => {
    await api(`/api/domains/${d.id}`, { method: "DELETE" });
    setRemoving(null);
    await load();
  });

  if (!list) return <div className={s.lookPanel} aria-label="Domains" aria-busy="true">{err ? <p className={s.note} role="alert">{err}</p> : <p className={s.meta}>Loading domains…</p>}</div>;
  const gate = domainGate(list);
  return (
    <div className={s.lookPanel} aria-label="Domains" data-domains={gate}>
      <span className={s.lookLabel}>Domains</span>
      {gate === "free" ? (
        <p className={s.note}>Connecting your own domain is on Plus, Pro and Business (1, 3 and 10 domains). {name}&rsquo;s free Keplar address keeps working on every plan. <Link href="/pricing">See plans</Link></p>
      ) : gate === "unconfigured" ? (
        <p className={s.note}>Custom domains aren&rsquo;t switched on for this server yet, so one can&rsquo;t be added right now.</p>
      ) : gate === "unpublished" && list.domains.length === 0 ? (
        <p className={s.note}>Publish {name} first, then connect a domain to it.</p>
      ) : (
        <form className={s.domainForm} onSubmit={(e) => { e.preventDefault(); if (hostFrom(input).length >= 4) void add(); }}>
          <input className={s.input} aria-label="Domain name" placeholder="example.com or shop.example.com" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={253} disabled={gate !== "open"} />
          <button type="submit" className={s.primary} disabled={busy !== null || gate !== "open" || hostFrom(input).length < 4} data-add-domain="">{busy === "add" ? "Adding…" : "Add domain"}</button>
          <span className={s.meta}>{list.used} of {list.limit} {list.limit === 1 ? "domain" : "domains"} used on your plan{gate === "full" ? ". Remove one to add another" : ""}</span>
        </form>
      )}
      {err ? <p className={s.note} role="alert">{err}</p> : null}
      {list.domains.map((d) => (
        <section key={d.id} className={s.domain} aria-label={d.hostname} data-status={d.status}>
          <div className={s.domainHead}>
            <strong>{d.hostname}</strong>
            <span className={s.domainStatus} data-status={d.status} role="status">{STATUS[d.status]}</span>
            {d.status === "active" ? <a className={s.meta} href={d.url} target="_blank" rel="noreferrer">Open</a> : null}
          </div>
          {d.status !== "active" && d.records.length ? (
            <>
              <p className={s.meta}>Add {d.records.length === 1 ? "this record" : "these records"} where your domain&rsquo;s DNS is managed:</p>
              <table className={s.records}>
                <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                <tbody>{d.records.map((r, i) => <tr key={i}><td>{r.type}</td><td>{r.name}</td><td><code>{r.value}</code></td></tr>)}</tbody>
              </table>
            </>
          ) : null}
          {d.message && d.status !== "active" ? <p className={s.meta}>{d.message}</p> : null}
          {d.problems.slice(0, 2).map((p, i) => <p key={i} className={s.note}>{p.title ?? p.detail}{p.fix ? ` ${p.fix}` : ""}</p>)}
          {removing?.id === d.id ? (
            <Confirm text={`Disconnect ${d.hostname} from ${name}? Visitors will no longer reach it at that address.`} yes="Remove domain" busy={busy === `r:${d.id}`} onYes={() => void remove(d)} onNo={() => setRemoving(null)} />
          ) : (
            <div className={s.lookRow}>
              {d.status !== "active" ? <button type="button" className={s.lookChip} disabled={busy !== null} onClick={() => void check(d)}>{busy === `c:${d.id}` ? "Checking…" : "Check again"}</button> : null}
              <button type="button" className={s.lookChip} disabled={busy !== null} onClick={() => setRemoving(d)} data-remove-domain="">Remove</button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
