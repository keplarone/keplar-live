import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { FEEDBACK_KINDS, type FeedbackKind } from "@/lib/growth/research";
import s from "@/components/feedback/Feedback.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Tell the Keplar team what works, what doesn't and what you would change. Anonymous by default.",
  alternates: { canonical: "/feedback" },
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const q = await searchParams;
  const kind: FeedbackKind = FEEDBACK_KINDS.find((k) => k === q.kind) ?? "general";
  const from = typeof q.from === "string" && /^[a-z0-9:_.-]{1,60}$/i.test(q.from) ? q.from : undefined;
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Feedback</p>
      <h1 className={s.title}><TwoTone text={"Tell us what to fix, keep or change."} /></h1>
      <p className={s.lede}>
        Keplar was built by two co-founders, Hassen and Hussain Keder. Every message is read by a person. Answers are stored as text you typed, shown only to the team, and used to decide what to build next. Leave your email out and it stays anonymous.
      </p>
      <FeedbackForm initialKind={kind} from={from} />
      <p className={s.note}>
        You never have to fill this in to use Keplar or to cancel a plan. Canceling is always done from your account or your Whop billing page and is not affected by anything you write here.
      </p>
    </div>
  );
}
