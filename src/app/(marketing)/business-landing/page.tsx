import type { Metadata } from "next";
import { TwoTone } from "@/components/page/TwoTone";
import { PRODUCTION_URL } from "@/lib/site";
import s from "./business-landing.module.css";

export const metadata: Metadata = {
  title: "Keplar Business",
  description: "Orders, inbox, approvals and agents in one place, with Keplar doing the work and you deciding what ships. Keplar Business is being built.",
  robots: { index: false },
};

const PARTS = [
  { title: "Orders", body: "Every order from your site in one list, with refunds and fulfilment a click away." },
  { title: "Inbox", body: "Customer messages and leads, with drafted replies you approve before they send." },
  { title: "Approvals", body: "Anything that spends money, emails a customer or posts publicly waits for your yes." },
  { title: "Agents", body: "Scheduled work like reorders, briefings and review replies, running inside the limits you set." },
];

/**
 * business.keplar.one (src/proxy.ts businessHost rewrites / here). The landing page for Keplar Business while it is being built:
 * what it will do, plainly marked as coming, and two ways out. Links are absolute so they leave the business host.
 */
export default function BusinessLanding() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.kicker}>Keplar Business</p>
        <h1 className={s.title}><TwoTone text="Run a business? Keplar can run it with you." /></h1>
        <p className={s.lede}>Orders, inbox, approvals and agents in one place, with Keplar doing the work and you deciding what ships. We are building it now.</p>
        <div className={s.actions}>
          <a href={`${PRODUCTION_URL}/contact`} className={s.primary}>Talk to us</a>
          <a href={`${PRODUCTION_URL}/app`} className={s.secondary}>Use Keplar today</a>
        </div>
      </header>
      <ul className={s.grid}>
        {PARTS.map((p) => (
          <li key={p.title} className={s.card}>
            <span className={s.soon}>Coming soon</span>
            <h2 className={s.cardTitle}>{p.title}</h2>
            <p className={s.cardBody}>{p.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
