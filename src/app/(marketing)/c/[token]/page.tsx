import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { openChatShare } from "@/lib/growth/chat-share";
import s from "@/components/share/Shared.module.css";
import { SharedCta } from "@/components/share/SharedBody";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A shared Keplar chat",
  description: "A conversation shared by a Keplar user.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

/** A shared chat: the turns the owner picked, redacted on the server, as plain text. Revoked, expired or unknown links are a real 404. */
export default async function SharedChat({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await openChatShare(token, { count: true }).catch(() => null);
  if (!r) notFound();
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>A shared Keplar chat</p>
      <h1 className={s.title} dir="auto">{r.title}</h1>
      <p className={s.notice}>
        Shared by a Keplar user, who chose to make this link and which parts to include. Personal details may have been hidden by the owner. Keplar has not verified it, and models can be wrong even when they agree, so check anything important. This page is not listed in search engines.
      </p>
      <ol className={s.list} style={{ marginTop: "var(--s-8)" }} aria-label="Conversation">
        {r.turns.map((t, i) => (
          <li key={i} className={s.card} style={{ marginTop: 0 }}>
            <p className={s.qLabel}>{t.role === "user" ? "Question" : "Keplar"}</p>
            <p className={t.role === "user" ? s.q : s.answer} dir="auto" style={{ marginTop: 0 }}>{t.text}</p>
          </li>
        ))}
      </ol>
      <SharedCta campaign="shared-chat" report={{ ref: `c:${token}`, excerpt: r.turns.map((t) => t.text).join("\n").slice(0, 400) }} />
    </div>
  );
}
