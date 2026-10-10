"use client";

import { useEffect, useState } from "react";
import { isPaid, usePlan } from "@/components/billing/usePlan";
import { TrackedLink } from "./TrackedLink";
import s from "./growth.module.css";

/** Small-screen bar that appears after the first screen. Paid plans never see it. */
export function StickyCta({ where }: { where: string }) {
  const me = usePlan();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(window.scrollY > 520);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (!me.ready || isPaid(me) || me.admin) return null;
  const upgrade = me.signedIn;
  return (
    <div className={s.sticky} data-shown={shown || undefined} aria-hidden={!shown}>
      <TrackedLink
        where={`${where}:sticky`}
        href={upgrade ? "/pricing" : "/app"}
        size="md"
        arrow
        magnetic={false}
        tabIndex={shown ? 0 : -1}
      >
        {upgrade ? "Upgrade your plan" : "Try Keplar free"}
      </TrackedLink>
    </div>
  );
}
