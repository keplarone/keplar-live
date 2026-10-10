"use client";
/** Custom domains for a published Create site: add, DNS records to set, Verify, status, remove. All state comes from /api/domains. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import s from "./create.module.css";
import d from "./domains.module.css";

type DomainRecord = { type: "A" | "CNAME" | "TXT"; name: string; host: string; value: string; alsoAccepted?: string[]; found?: string[]; purpose: string; done: boolean };
type Problem = { code: string; severity: "error" | "warning" | "info"; title: string; detail: string; fix: string };
type Status = "pending" | "verifying" | "active" | "error";
export type SiteDomain = { id: string; hostname: string; status: Status; apex: boolean; records: DomainRecord[]; problems?: Problem[]; nameservers?: string[]; message: string | null; lastCheckedAt: string | null; url: string };
type Listing = { domains: SiteDomain[]; limit: number; used: number; plan: string; configured: boolean; published: boolean };

const LABEL: Record<Status, string> = { pending: "Waiting for DNS", verifying: "Checking…", active: "Active", error: "Needs attention" };

function Copy({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={d.copy}
      aria-label={`Copy ${what}: ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard can be blocked; the value is on screen */
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function DomainPanel({ siteId }: { siteId: string }) {
  const [list, setList] = useState<Listing | null>(null);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const alive = useRef(true);

  const fetchList = useCallback(() => api<Listing>(`/api/domains?siteId=${encodeURIComponent(siteId)}`), [siteId]);
  const load = useCallback(async () => {
    try {
      const r = await fetchList();
      if (alive.current) {
        setList(r);
        setLoadErr(null);
      }
    } catch (e) {
      if (alive.current) setLoadErr(e instanceof Error ? e.message : "Couldn't load your domains.");
    }
  }, [fetchList]);

  useEffect(() => {
    alive.current = true;
    fetchList()
      .then((r) => alive.current && setList(r))
      .catch((e: unknown) => alive.current && setLoadErr(e instanceof Error ? e.message : "Couldn't load your domains."));
    return () => {
      alive.current = false;
    };
  }, [fetchList]);

  // While a domain is waiting, ask the server for its state every 15 s (the server re-checks DNS at most every ~20 s).
  const waiting = list?.domains.filter((x) => x.status === "pending" || x.status === "verifying").map((x) => x.id).join(",") ?? "";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const ids = waiting.split(",");
      const next = await Promise.all(ids.map((id) => api<{ domain: SiteDomain }>(`/api/domains/${id}`).then((r) => r.domain).catch(() => null)));
      if (!alive.current) return;
      setList((cur) => (cur ? { ...cur, domains: cur.domains.map((x) => next.find((n) => n?.id === x.id) ?? x) } : cur));
    }, 15_000);
    return () => clearInterval(t);
  }, [waiting]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void act("add", async () => {
      await api("/api/domains", { method: "POST", body: JSON.stringify({ siteId, domain: input }) });
      setInput("");
      await load();
    });
  };
  const verify = (id: string) =>
    act(`v:${id}`, async () => {
      const r = await api<{ domain: SiteDomain }>(`/api/domains/${id}`, { method: "POST" });
      setList((cur) => (cur ? { ...cur, domains: cur.domains.map((x) => (x.id === id ? r.domain : x)) } : cur));
    });
  const remove = (x: SiteDomain) => {
    if (!window.confirm(`Disconnect ${x.hostname} from this site? Visitors will no longer reach the site at that address.`)) return;
    void act(`r:${x.id}`, async () => {
      await api(`/api/domains/${x.id}`, { method: "DELETE" });
      await load();
    });
  };

  if (!list) return <p className={s.muted}>{loadErr ?? "Loading…"}</p>;
  const free = list.limit <= 0;
  const full = list.used >= list.limit;

  return (
    <div className={d.root}>
      {free ? (
        <p className={s.muted}>
          Connecting your own domain is available on Plus, Pro and Business (1, 3 and 10 domains). Your free address keeps working on every plan. <Link href="/pricing">See plans</Link>
        </p>
      ) : !list.configured ? (
        <p className={s.muted}>Custom domains aren&apos;t switched on for this server yet, so they can&apos;t be added right now.</p>
      ) : !list.published && list.domains.length === 0 ? (
        <p className={s.muted}>Publish your site first, then connect a domain to it.</p>
      ) : (
        <form className={d.form} onSubmit={add}>
          <label htmlFor={`dom-${siteId}`} className="visually-hidden">
            Domain name
          </label>
          <input id={`dom-${siteId}`} className={s.input} placeholder="example.com or shop.example.com" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={253} />
          <button className={s.btn} type="submit" disabled={busy !== null || input.trim().length < 4 || full || !list.published}>
            {busy === "add" ? "Adding…" : "Add domain"}
          </button>
          <span className={d.usage}>
            {list.used} of {list.limit} domain{list.limit === 1 ? "" : "s"} used on your plan
          </span>
        </form>
      )}
      {full && !free ? (
        <p className={d.note}>
          You&apos;ve used all {list.limit} domain{list.limit === 1 ? "" : "s"} on your plan. Remove one to add another, or <Link href="/pricing">upgrade</Link>.
        </p>
      ) : null}
      {err ? (
        <p className={d.err} role="alert">
          {err}
        </p>
      ) : null}

      {list.domains.map((x) => (
        <section key={x.id} className={d.domain} aria-label={x.hostname}>
          <div className={d.head}>
            <span className={d.name}>{x.hostname}</span>
            <span className={d.pill} data-status={x.status} role="status">
              {LABEL[x.status]}
            </span>
          </div>
          {x.status === "active" ? (
            <p className={d.msg}>
              Live at{" "}
              <a href={x.url} target="_blank" rel="noreferrer">
                {x.url}
              </a>
              . HTTPS is issued automatically; if the first visit shows a certificate warning, wait a minute and reload.
            </p>
          ) : (
            <>
              <p className={d.msg}>{x.status === "verifying" ? "Checking your DNS…" : (x.message ?? "Add these records at your domain provider (the company where you bought the domain), then press Check again.")}</p>
              {x.problems && x.problems.length > 0 ? (
                <ul className={d.problems} aria-label="Problems found with your DNS">
                  {x.problems.map((p) => (
                    <li key={p.code} className={d.problem} data-severity={p.severity}>
                      <strong>{p.title}.</strong> {p.detail} <span className={d.fix}>What to do: {p.fix}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={d.tableWrap}>
                <table className={d.table}>
                  <caption className="visually-hidden">DNS records for {x.hostname}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Name / host</th>
                      <th scope="col">Value</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {x.records.map((r) => (
                      <tr key={`${r.type}:${r.host}:${r.value}`}>
                        <td className={d.mono}>{r.type}</td>
                        <td>
                          <span className={d.mono}>{r.name}</span> <Copy value={r.name} what="name" />
                        </td>
                        <td>
                          <span className={d.mono}>{r.value}</span> <Copy value={r.value} what="value" />
                          {r.alsoAccepted && r.alsoAccepted.length > 0 ? <span className={d.note}> Also accepted: {r.alsoAccepted.join(", ")}</span> : null}
                          {(r.type === "A" || r.type === "CNAME") && !r.done ? (
                            <span className={d.found} data-testid="dns-found">
                              {r.found && r.found.length > 0 ? `Found at your domain right now: ${r.found.join(", ")}` : "Found at your domain right now: nothing"}
                            </span>
                          ) : null}
                        </td>
                        <td className={r.done ? d.done : d.note}>{r.done ? "Found" : "Not found yet"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={d.note}>
                Add all of these. &quot;Check again&quot; looks up your DNS fresh (Google and Cloudflare) and asks the hosting provider again, so it never shows an old answer. DNS changes can take a few minutes to a few hours to spread (occasionally longer), so a record can show as not found for a while. HTTPS is issued automatically once DNS is correct. If you use Cloudflare, set the record to &quot;DNS only&quot; (gray cloud). Name is shown relative to your domain; some providers want the full host name instead.
              </p>
            </>
          )}
          <div className={d.actions}>
            {x.status !== "active" ? (
              <button type="button" className={s.btn} disabled={busy !== null} onClick={() => void verify(x.id)}>
                {busy === `v:${x.id}` ? "Checking…" : "Check again"}
              </button>
            ) : (
              <a className={`${s.btn} ${s.btnGhost}`} href={x.url} target="_blank" rel="noreferrer">
                Open site
              </a>
            )}
            <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={busy !== null} onClick={() => remove(x)}>
              {busy === `r:${x.id}` ? "Removing…" : "Remove"}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
