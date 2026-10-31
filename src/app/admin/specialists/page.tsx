import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpecialistListingActions } from "@/components/admin/SpecialistListingActions";
import s from "@/components/admin/Admin.module.css";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { listReports } from "@/lib/safety/store";
import { listingsForReview } from "@/lib/personalize/specialist-directory";

export const dynamic = "force-dynamic";
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/** Admin: Specialist directory review. Nothing is public until approved here; hiding takes it down at once. */
export default async function AdminSpecialistsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [rows, reports] = await Promise.all([listingsForReview(200).catch(() => null), listReports(500).catch(() => [])]);
  const open = (token: string) => reports.filter((r) => r.answerId === `shared:sp:${token}` && r.status === "open").length;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · specialists</p>
        <h1>Specialist directory</h1>
        <p className={s.sub}>Specialists owners asked to list publicly. Open each link and read the instructions before approving. Reports arrive in the <Link href="/admin/inbox">inbox</Link>. <Link href="/admin">Operations</Link></p>
      </header>
      <section className={s.panel} aria-labelledby="sp-h">
        <h2 id="sp-h">Listings {rows ? `(${rows.length})` : ""}</h2>
        {!rows ? <p className={s.empty}>Could not read listings.</p> : !rows.length ? <p className={s.empty}>Nothing submitted yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Submitted</th><th scope="col">Specialist</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Automatic screen</th><th scope="col">Open reports</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.createdAt)}</td>
                    <td><a href={`/sp/${r.token}`} target="_blank" rel="noopener noreferrer">{r.name}</a><br />{r.description.slice(0, 120)}</td>
                    <td>{r.category}</td>
                    <td>{r.status}{r.decidedBy ? ` (${r.decidedBy})` : ""}</td>
                    <td>{r.screen.engine}{r.screen.flags.length ? `: ${r.screen.flags.join("; ")}` : ": nothing flagged"}</td>
                    <td>{open(r.token)}</td>
                    <td><SpecialistListingActions token={r.token} status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
