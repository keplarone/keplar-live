import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { ALERTS, recentSecurityEvents, securityEventRetentionDays, type SecurityEvent, type SecurityEventKind } from "@/lib/security/events";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

/** Every kind the log can hold, in the order the page lists them: what an attacker tries first comes first. */
const KINDS: { kind: SecurityEventKind; label: string; means: string }[] = [
  { kind: "authz.denied", label: "Authorization refused", means: "Anonymous or cross-site calls, and admin pages opened by non-admins" },
  { kind: "auth.throttled", label: "Sign-in limiter tripped", means: "Password guessing from one address, network or against one email" },
  { kind: "auth.failed", label: "Sign-in failed", means: "Wrong password, code or link" },
  { kind: "auth.mfa_failed", label: "Wrong second factor", means: "Authenticator or recovery code refused" },
  { kind: "upload.rejected", label: "Upload refused", means: "Active PDF, polyglot, executable or scanner verdict" },
  { kind: "export.data", label: "Data export", means: "An account downloaded its data" },
  { kind: "secret.access", label: "Secret opened", means: "A connector token was unsealed to make a request" },
  { kind: "billing.change", label: "Billing change", means: "A plan granted or revoked by a webhook" },
  { kind: "agent.action", label: "Agent action", means: "An outbound action inspected by the Firewall" },
  { kind: "admin.action", label: "Admin action", means: "Anything written to the admin audit log" },
  { kind: "config.change", label: "Setting changed", means: "Kill switches and limits" },
  { kind: "auth.signin", label: "Sign-in", means: "A successful sign-in" },
];
const labelOf = (k: string) => KINDS.find((x) => x.kind === k)?.label ?? k;
const isKind = (v: string | undefined): v is SecurityEventKind => KINDS.some((k) => k.kind === v);

const when = (iso: string) => {
  const d = new Date(iso);
  return { iso, text: d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) };
};

/** Events per hour for the last 7 days (168 bars), oldest first. */
function hourly(events: SecurityEvent[], now = Date.now()): number[] {
  const bars = new Array<number>(168).fill(0);
  for (const e of events) {
    const age = Math.floor((now - Date.parse(e.at)) / 3_600_000);
    if (age >= 0 && age < 168) bars[167 - age] += 1;
  }
  return bars;
}

export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const { kind } = await searchParams;
  const filter = isKind(kind) ? kind : null;
  const all = await recentSecurityEvents(2000).catch(() => null);
  if (!all) {
    return (
      <div className={s.page}>
        <p className={s.empty}>Could not read the security event log.</p>
      </div>
    );
  }
  const counts = new Map<string, number>();
  for (const e of all) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const shown = (filter ? all.filter((e) => e.kind === filter) : all).slice(0, 300);
  const bars = hourly(all);
  const peak = Math.max(1, ...bars);
  const retention = securityEventRetentionDays();
  const alerted = KINDS.filter((k) => ALERTS[k.kind]);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · security · last 7 days · real rows only</p>
        <h1>Security events</h1>
        <p className={s.sub}>
          Every refused call, tripped limiter, wrong code, secret opened, billing change and agent action, as the code recorded it (<code>src/lib/security/events.ts</code>).
          Addresses and accounts appear as short hashes: enough to see that one source is behind a burst, never enough to identify anyone from this page.
          Rows are kept {retention} days. <Link href="/admin">Operations</Link> · <Link href="/admin/reliability">Reliability</Link> · <Link href="/admin/errors">Errors</Link>
        </p>
      </header>

      <section className={s.panel} aria-labelledby="week-h">
        <h2 id="week-h">Events per hour, last 7 days</h2>
        <div className={s.spark} role="img" aria-label={`${all.length} events in the last 7 days; busiest hour ${peak}`}>
          {bars.map((n, i) => <span key={i} style={{ height: `${Math.max(2, Math.round((n / peak) * 100))}%` }} />)}
        </div>
        <p className={s.sub}>{all.length.toLocaleString("en-US")} events in 7 days; busiest hour {peak}. A flat line is the normal state.</p>
      </section>

      <nav className={s.grid} aria-label="Event kinds">
        {KINDS.map((k) => {
          const n = counts.get(k.kind) ?? 0;
          const active = filter === k.kind;
          return (
            <Link key={k.kind} href={active ? "/admin/security" : `/admin/security?kind=${k.kind}`} className={s.stat} aria-current={active ? "page" : undefined} style={active ? { borderColor: "var(--c-ink)" } : undefined}>
              <span>{k.label}{active ? " · showing" : ""}</span>
              <b>{n.toLocaleString("en-US")}</b>
              <small>{k.means}</small>
            </Link>
          );
        })}
      </nav>

      <section className={s.panel} aria-labelledby="rows-h">
        <h2 id="rows-h">{filter ? `${labelOf(filter)}: ${shown.length} most recent` : `All kinds: ${shown.length} most recent`}</h2>
        {shown.length ? (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">When (ET)</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Code</th>
                  <th scope="col">Where</th>
                  <th scope="col">Status</th>
                  <th scope="col">Address</th>
                  <th scope="col">Account</th>
                  <th scope="col">Request</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const t = when(e.at);
                  return (
                    <tr key={e.id}>
                      <td><time dateTime={t.iso}>{t.text}</time></td>
                      <td>{labelOf(e.kind)}</td>
                      <td><code>{e.code}</code></td>
                      <td><code>{e.where}</code></td>
                      <td>{e.status ?? "—"}</td>
                      <td><code>{e.ipKey ?? "—"}</code></td>
                      <td><code>{e.acctKey ?? "—"}</code></td>
                      <td><code>{e.reqId ?? "—"}</code></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={s.empty}>{filter ? `No ${labelOf(filter).toLowerCase()} events in the last 7 days.` : "No security events in the last 7 days. The log starts filling the moment a route refuses someone."}</p>
        )}
      </section>

      <section className={s.panel} aria-labelledby="alerts-h">
        <h2 id="alerts-h">When you get emailed</h2>
        <p className={s.sub}>Thresholds per 10 minutes. Crossing one sends one email per kind per hour to the owner address; nothing is blocked beyond the normal rate limits. Values live in <code>ALERTS</code> in <code>src/lib/security/events.ts</code>.</p>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Per address</th>
                <th scope="col">Per account</th>
                <th scope="col">Email subject</th>
              </tr>
            </thead>
            <tbody>
              {alerted.map((k) => {
                const a = ALERTS[k.kind]!;
                return (
                  <tr key={k.kind}>
                    <td>{k.label}</td>
                    <td>{a.perIp ?? "—"}</td>
                    <td>{a.perAccount ?? "—"}</td>
                    <td>{a.subject}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
