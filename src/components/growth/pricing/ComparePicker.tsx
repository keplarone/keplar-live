"use client";

import { useState } from "react";
import s from "./pricing.module.css";

/**
 * Phones (640px and narrower): the comparison table shows the feature column and one plan at a time, chosen with a row of
 * toggle buttons above it, instead of five columns squeezed into 390px with the last ones cut off. Every row and every plan's
 * value is still one tap away; wider screens see the full table and never the buttons (pricing.module.css). The table cells carry
 * data-plan; the scoped rule below hides the other plans' cells on phones only.
 */
export function ComparePicker({ plans, initial, children }: { plans: { id: string; name: string }[]; initial: string; children: React.ReactNode }) {
  const [pick, setPick] = useState(initial);
  return (
    <div data-compare="">
      <style>{`@media (max-width: 640px) { [data-compare] [data-plan]:not([data-plan="${pick.replace(/[^a-z-]/g, "")}"]) { display: none; } }`}</style>
      <div className={s.picker} role="group" aria-label="Plan shown in the table">
        {plans.map((p) => (
          <button key={p.id} type="button" aria-pressed={pick === p.id} onClick={() => setPick(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
