"use client";

import { useEffect, useState } from "react";
import { brand } from "@/lib/site";
import s from "./App.module.css";

const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : String(m)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Above the composer: the live Keplar usage cooldown (real server `until`, ticking each second, re-checks the meter when it
 * ends) and the global breaker notice. The live region announces only the start and the end, not every second.
 */
export function UsageNotice({ cooldown, breakerNotice, onEnd }: { cooldown: { until: string; message: string } | null; breakerNotice: string | null; onEnd: () => void }) {
  const until = cooldown ? Date.parse(cooldown.until) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    let ended = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (until - t <= 0 && !ended) {
        ended = true;
        onEnd();
      }
    };
    const t = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [until, onEnd]);
  const left = Math.max(0, until - now);

  const active = Boolean(cooldown) && left > 0;
  if (!active && !breakerNotice) return null;
  return (
    <div className={s.usageNotice} data-kind={active ? "cooldown" : "breaker"}>
      {active ? (
        <>
          <p>
            <b>{brand.usage} cooldown</b> · <span className={s.usageClock} aria-hidden="true">{clock(left)}</span> left. Your credits are kept; new requests resume automatically.
          </p>
          <p className="visually-hidden" role="status">Usage cooldown is active. New requests are paused for about {Math.ceil(left / 60000)} minutes.</p>
        </>
      ) : (
        <p role="status">{breakerNotice}</p>
      )}
    </div>
  );
}
