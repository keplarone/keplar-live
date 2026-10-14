"use client";

import { useEffect, useState } from "react";
import { useClientText } from "@/lib/i18n/client";
import s from "./SectionIndex.module.css";

const ITEMS: { id: string; label: string }[] = [
  { id: "hero", label: "Ask" },
  { id: "question", label: "Question" },
  { id: "distribution", label: "Route" },
  { id: "responses", label: "Respond" },
  { id: "disagreement", label: "Compare" },
  { id: "verification", label: "Verify" },
  { id: "convergence", label: "Answer" },
];

/** Left-edge vertical index of the home story. Sections announce themselves with a `keplar:act` event; this only listens. */
export function SectionIndex() {
  const labels = useClientText().home.index;
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let off = 0;
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id ?? null;
      window.clearTimeout(off);
      if (id) setActive(id);
      else off = window.setTimeout(() => setActive(null), 160); // the next section may announce itself right after
    };
    window.addEventListener("keplar:act", on);
    return () => {
      window.removeEventListener("keplar:act", on);
      window.clearTimeout(off);
    };
  }, []);
  return (
    <ol className={s.index} data-on={active ? "" : undefined} aria-hidden="true">
      {ITEMS.map((it, i) => (
        <li key={it.id} data-active={active === it.id || undefined}>
          <i />
          <span>{labels[i] ?? it.label}</span>
        </li>
      ))}
    </ol>
  );
}
