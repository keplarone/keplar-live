"use client";

import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/ui/space";

/**
 * Space Studio's RollIn (renderer/dashboard/bits.tsx): a RollingNumber that, on its first appearance, rolls up from zeros in
 * every column to the real value; later changes roll from the old value. Screen readers get the plain formatted number.
 * Reduced motion shows the value at once.
 */
export function RollIn({ value, format = (n: number) => Math.round(n).toLocaleString("en-US"), className, delay = 0 }: { value: number; format?: (n: number) => string; className?: string; delay?: number }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setArmed(true), still ? 0 : 60 + delay);
    return () => window.clearTimeout(t);
  }, [armed, delay]);
  const fmt = armed ? format : (n: number) => format(n).replace(/\d/g, "0");
  return <RollingNumber value={value} format={fmt} className={className} durationMs={armed ? 1100 : 900} />;
}
