import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { listErrors, sentryConfigured } from "@/lib/ops/errors";
import { ErrorStatusButton } from "@/components/admin/ErrorStatusButton";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/** Unhandled errors grouped by fingerprint (own tracker). Messages are scrubbed; no bodies, headers or user ids are stored. */
export default async function AdminErrorsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const list = await listErrors(30).catch(() => null);
  const open = list?.filter((e) => e.status === "open") ?? [];
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · errors · last 30 days</p>
        <h1>Errors</h1>
        <p className={s.sub}>Grouped by fingerprint; the sample id finds the log line in Vercel (every log line carries the request id). Also forwarded to Sentry: <b>{sentryConfigured() ? "yes (SENTRY_DSN is set; untested against a real project)" : "no (SENTRY_DSN not set)"}</b>. <Link href="/admin">Operations</Link></p>
      </header>
      {open.length ? <p className={s.alertWarn} role="status">{open.length} open error group{open.length === 1 ? "" : "s"}.</p> : null}
      {!list ? <p className={s.empty}>Could not read the error log.</p> : !list.length ? <p className={s.empty}>No errors recorded in the last 30 days. (This only covers errors the app caught or Next.js reported; a crashed process or an outage is not visible here. See Status and Vercel logs.)</p> : (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead><tr><th scope="col">Last seen</th><th scope="col">Count</th><th scope="col">Where</th><th scope="col">Error</th><th scope="col">Sample id</th><th scope="col">First seen</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}><td>{when(e.at)}</td><td>{e.count}</td><td>{e.source} {e.route}</td><td><b>{e.name}</b> {e.message}</td><td>{e.sample || "—"}</td><td>{when(e.firstAt)}</td><td>{e.status}</td><td><ErrorStatusButton id={e.id} status={e.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
