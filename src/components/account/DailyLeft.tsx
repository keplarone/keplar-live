"use client";
import { useEffect, useState } from "react";
import { dailyLeftText, formatDailyReset } from "@/lib/usage/format";

type Meter = { used: number; limit: number; left: number; resetsAt: string };

/** Free plan: "47 of 50 left today", from the server count; refreshes when the tab regains focus. The reset time is shown in the visitor's own clock. */
export function DailyLeft({ initial }: { initial: Meter }) {
  const [m, setM] = useState<Meter>(initial);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => { // after mount: the reset time is in the browser's own clock, which the server can't know
    const t = setTimeout(() => setLocal(formatDailyReset(m.resetsAt)), 0);
    return () => clearTimeout(t);
  }, [m.resetsAt]);
  useEffect(() => {
    const sync = async () => {
      try {
        const r = await fetch("/api/compute", { cache: "no-store" });
        const j = (await r.json()) as { daily?: Meter | null };
        if (j.daily) setM(j.daily);
      } catch { /* keep the last known number */ }
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);
  return (
    <span data-daily-left={m.left}>
      {dailyLeftText(m)} today{local ? ` · resets ${local}` : " · resets at 00:00 UTC"}
    </span>
  );
}
