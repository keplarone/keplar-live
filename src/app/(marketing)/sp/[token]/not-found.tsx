import type { Metadata } from "next";
import Link from "next/link";
import s from "@/components/share/Shared.module.css";

export const metadata: Metadata = { title: "This link isn't available", robots: { index: false, follow: false } };

export default function SharedSpecialistGone() {
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Shared specialist</p>
      <h1 className={s.title}>This link isn&apos;t available.</h1>
      <p className={s.notice}>The person who shared it may have turned it off, or it has expired. Specialist links stay live for 180 days at most.</p>
      <div className={s.cta}>
        <Link className={s.btn} href="/app?utm_source=share&utm_medium=link&utm_campaign=shared-specialist-gone">Ask your own question</Link>
      </div>
    </div>
  );
}
