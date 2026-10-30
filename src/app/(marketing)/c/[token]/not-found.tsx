import type { Metadata } from "next";
import Link from "next/link";
import s from "@/components/share/Shared.module.css";

export const metadata: Metadata = { title: "This link isn't available", robots: { index: false, follow: false } };

export default function SharedChatGone() {
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Shared chat</p>
      <h1 className={s.title}>This link isn&apos;t available.</h1>
      <p className={s.notice}>The person who shared it may have turned it off, or it has expired. Links stay live for 90 days at most.</p>
      <div className={s.cta}>
        <Link className={s.btn} data-orbit-fx="primary" href="/app?utm_source=share&utm_medium=link&utm_campaign=shared-chat-gone">Ask your own question</Link>
      </div>
    </div>
  );
}
