import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { devToolsEnabled, listOutbox } from "@/lib/accounts/outbox";
import s from "@/components/account/account.module.css";

export const metadata = pageMeta("/dev/outbox", "Dev outbox", "Development email outbox.", { noindex: true });
export const dynamic = "force-dynamic";

/** Dev-only: emails captured when RESEND_API_KEY is unset. 404 unless KEPLAR_DEV_TOOLS=1. */
export default async function Outbox() {
  if (!devToolsEnabled()) notFound();
  const mails = await listOutbox();
  const linkify = (t: string) => t.split(/(https?:\/\/\S+)/g).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} className={s.link} href={part}>{part}</a> : part));
  return (
    <section className={s.page}>
      <div className={`${s.card} ${s.wide}`}>
        <p className={s.eyebrow}>Dev tools</p>
        <h1 className={s.title}>Outbox</h1>
        <p className={s.lead}>Emails that would be sent by Resend. Newest first.</p>
        <div className={s.panel}>
          {mails.length === 0 ? <p className={s.note}>No emails yet.</p> : null}
          {mails.map((m) => (
            <div key={m.id} className={s.mail}>
              <div className={s.row}><span className={s.v}>{m.subject}</span><span className={s.k}>{new Date(m.at).toLocaleString("en-US")}</span></div>
              <span className={s.k}>to {m.to} · {m.kind}</span>
              <p className={s.pre}>{linkify(m.text)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
