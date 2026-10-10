"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import s from "./pricing.module.css";

type Notes = Record<string, { title: string; body: string }>;

/**
 * A short explanation for people sent here from inside the app (`/pricing?from=daily-limit|credits|feature|upsell`).
 * The notes come from the server (src/lib/growth/pricing-page.ts) so this client file pulls in no server modules.
 * Unknown or missing values render nothing. No countdowns, no urgency, nothing that blocks the page.
 */
export function PricingContext({ notes }: { notes: Notes }) {
  const raw = useSearchParams().get("from");
  const from = raw && Object.prototype.hasOwnProperty.call(notes, raw) ? raw : null;
  useEffect(() => {
    if (from) track("pricing_context", { from });
  }, [from]);
  if (!from) return null;
  const c = notes[from];
  return (
    <div className={s.contextWrap}>
      <aside className={s.context} role="status" aria-label="Why you are seeing plans">
        <p className={s.contextTitle}>{c.title}</p>
        <p className={s.contextBody}>{c.body}</p>
      </aside>
    </div>
  );
}
