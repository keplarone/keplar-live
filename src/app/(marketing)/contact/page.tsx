import Link from "next/link";
import type { Metadata } from "next";
import { ContactForm } from "@/components/support/ContactForm";
import { TICKET_TOPICS, type TicketTopic } from "@/lib/support/topics";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import s from "@/components/feedback/Feedback.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata: Metadata = pageMeta("/contact", "Contact support", "Write to the Keplar team about your account, billing, a bug, connected apps, safety or your data.", { noindex: false });

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const q = await searchParams;
  const topic = TICKET_TOPICS.find((t) => t === q.topic) as TicketTopic | undefined;
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Support</p>
      <h1 className={s.title}><TwoTone text={"Contact the Keplar team."} /></h1>
      <p className={s.lede}>
        Your message is saved for the team and read by a person. We reply from {brand.feedbackEmail}; nothing is sent automatically and there is no guaranteed reply time. Check <Link href="/help">Help</Link> first, it covers the most common questions. If someone is in danger, contact your local emergency number.
      </p>
      <ContactForm initialTopic={topic} />
    </div>
  );
}
