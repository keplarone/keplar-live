import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateActions } from "@/components/admin/TemplateActions";
import s from "@/components/admin/Admin.module.css";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { listReports } from "@/lib/safety/store";
import { listForAdmin } from "@/lib/templates/store";

export const dynamic = "force-dynamic";
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/** Admin: community templates, with report counts. Pending (safety scan said "review") ones wait here for approval. */
export default async function AdminTemplatesPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const [rows, reports] = await Promise.all([listForAdmin(200).catch(() => null), listReports(500).catch(() => [])]);
  const open = (slug: string) => reports.filter((r) => r.answerId === `template:${slug}` && r.status === "open").length;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · templates</p>
        <h1>Community templates</h1>
        <p className={s.sub}>Snapshots owners chose to share. Reports arrive in the <Link href="/admin/inbox">inbox</Link> with the template address. Hiding removes a template from every public page at once. <Link href="/admin">Operations</Link></p>
      </header>
      <section className={s.panel} aria-labelledby="tpl-h">
        <h2 id="tpl-h">Templates {rows ? `(${rows.length})` : ""}</h2>
        {!rows ? <p className={s.empty}>Could not read templates.</p> : !rows.length ? <p className={s.empty}>No community templates yet.</p> : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th scope="col">Shared</th><th scope="col">Template</th><th scope="col">Status</th><th scope="col">Remixes</th><th scope="col">Open reports</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.createdAt)}</td>
                    <td><Link href={`/templates/${r.slug}`}>{r.title}</Link><br />{r.description.slice(0, 120)}</td>
                    <td>{r.status}</td><td>{r.remixes}</td><td>{open(r.slug)}</td>
                    <td><TemplateActions slug={r.slug} status={r.status} /></td>
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
