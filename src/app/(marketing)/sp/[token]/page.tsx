import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openSpecialistShare } from "@/lib/personalize/specialist-share";
import s from "@/components/share/Shared.module.css";
import { SharedCta } from "@/components/share/SharedBody";
import { AddSpecialist } from "./AddSpecialist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A shared Keplar specialist",
  description: "A specialist setup shared by a Keplar user.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

/** A shared specialist: everything it will do is shown before anyone adds it. Revoked, expired or unknown links are a real 404. */
export default async function SharedSpecialist({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openSpecialistShare(token, { count: true }).catch(() => null);
  if (!r) notFound();
  return (
    <div className={s.page}>
      <p className={s.eyebrow} data-o="Shared eyebrow">A shared Keplar specialist</p>
      <h1 className={s.title} dir="auto">{r.name}</h1>
      {r.description ? <p className={s.q} dir="auto" style={{ marginTop: "var(--s-3)" }}>{r.description}</p> : null}
      <p className={s.notice}>
        Shared by a Keplar user. Adding it puts your own copy in Settings &gt; Specialists, where you can read and change everything below. The person who shared it never sees your chats. Keplar&rsquo;s panel still answers and cross-checks every question, and these instructions can&rsquo;t override its accuracy or safety rules. This page is not listed in search engines.
      </p>
      <AddSpecialist token={token} />
      <section className={s.card} aria-label="Instructions">
        <p className={s.qLabel}>Instructions</p>
        <p className={s.answer} dir="auto" style={{ marginTop: 0 }}>{r.instructions}</p>
      </section>
      {r.includesNotes ? (
        <section className={s.card} aria-label="Reference notes">
          <p className={s.qLabel}>Reference notes</p>
          <p className={s.answer} dir="auto" style={{ marginTop: 0 }}>{r.knowledge}</p>
        </section>
      ) : null}
      {r.starters.length ? (
        <section className={s.card} aria-label="Conversation starters">
          <p className={s.qLabel}>Conversation starters</p>
          <ul className={s.list}>{r.starters.map((t) => <li key={t} dir="auto">{t}</li>)}</ul>
        </section>
      ) : null}
      <SharedCta campaign="shared-specialist" report={{ ref: `sp:${token}`, excerpt: `${r.name}\n${r.instructions}`.slice(0, 400) }} />
    </div>
  );
}
