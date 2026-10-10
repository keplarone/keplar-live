import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { maskEmail } from "@/lib/ops/audit";
import { listReports, recentSafetyEvents, REPORT_LABEL } from "@/lib/safety/store";
import { listTickets, TICKET_TOPIC_LABEL } from "@/lib/support/tickets";
import { InboxActions } from "@/components/admin/InboxActions";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
/** Reports sent from a shared page carry `shared:p:<public slug>` or `shared:r:<private token>`: show where it lives. */
const sharedRef = (id?: string) => {
  const t = id?.match(/^template:(.+)$/);
  if (t) return <><b>Template <Link href={`/templates/${t[1]}`}>/templates/{t[1]}</Link> (<Link href="/admin/templates">moderate</Link>)</b><br /></>;
  const m = id?.match(/^shared:([pr]):(.+)$/);
  if (!m) return null;
  return <><b>Shared page <Link href={m[1] === "p" ? `/answers/${m[2]}` : `/r/${m[2]}`}>{m[1] === "p" ? `/answers/${m[2]}` : "private link"}</Link></b><br /></>;
};
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/** Admin inbox: answer reports, support tickets and input-screen refusals. Stored in the database; nothing here is emailed automatically. */
export default async function AdminInboxPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [reports, tickets, events] = await Promise.all([listReports(100).catch(() => null), listTickets(100).catch(() => null), recentSafetyEvents(30, 500).catch(() => null)]);
  const byCat: Record<string, number> = {};
  for (const e of events ?? []) byCat[`${e.category} (${e.action})`] = (byCat[`${e.category} (${e.action})`] ?? 0) + 1;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Admin · inbox</p>
        <h1>Reports and support</h1>
        <p className={s.sub}>Stored in the database. Nothing here is emailed automatically: reply from team@keplar.one yourself. <Link href="/admin">Operations</Link></p>
      </header>

      <section className={s.panel} aria-labelledby="rep-h">
        <h2 id="rep-h">Answer reports {reports ? `(${reports.filter((r) => r.status === "open").length} open)` : ""}</h2>
        {!reports ? <p className={s.empty}>Could not read reports.</p> : !reports.length ? <p className={s.empty}>No reports yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">When</th><th scope="col">Reason</th><th scope="col">Details</th><th scope="col">Answer starts with</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.at)}</td><td>{REPORT_LABEL[r.category]}</td><td>{r.note || "—"}</td><td>{sharedRef(r.answerId)}{r.excerpt ? `${r.excerpt.slice(0, 160)}${r.excerpt.length > 160 ? "…" : ""}` : "—"}</td>
                    <td>{r.accountId ? r.plan ?? "signed in" : "signed out"}</td><td>{r.status}{r.reviewedBy ? ` (${maskEmail(r.reviewedBy)})` : ""}</td>
                    <td><InboxActions kind="report" id={r.id} current={r.status} options={["open", "reviewed", "dismissed"]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel} aria-labelledby="tk-h">
        <h2 id="tk-h">Support tickets {tickets ? `(${tickets.filter((t) => t.status === "open").length} open)` : ""}</h2>
        {!tickets ? <p className={s.empty}>Could not read tickets.</p> : !tickets.length ? <p className={s.empty}>No tickets yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">When</th><th scope="col">Topic</th><th scope="col">Subject and message</th><th scope="col">Reply to</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{when(t.at)}<br /><small>{t.id}</small></td><td>{TICKET_TOPIC_LABEL[t.topic]}</td>
                    <td><b>{t.subject}</b><br />{t.message}</td>
                    <td><a href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject} [${t.id}]`)}`}>{t.email}</a></td>
                    <td>{t.signedIn ? t.plan ?? "signed in" : "signed out"}</td><td>{t.status}</td>
                    <td><InboxActions kind="ticket" id={t.id} current={t.status} options={["open", "answered", "closed"]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel} aria-labelledby="se-h">
        <h2 id="se-h">Input screen, last 30 days</h2>
        <p className={s.sub}>Prompts the first-line screen refused (category only; the text is not stored). It is a narrow net, not a full classifier.</p>
        {!events ? <p className={s.empty}>Could not read events.</p> : !events.length ? <p className={s.empty}>None recorded.</p> : (
          <div className={s.scroll}><table className={s.table}><thead><tr><th scope="col">Category</th><th scope="col">Count</th></tr></thead><tbody>{Object.entries(byCat).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
