"use client";

import { openCookieSettings } from "@/lib/consent";

/** Re-opens the cookie choices. `className` lets the footer and Settings style it as a link or a button. */
export function CookieSettingsButton({ className, children = "Cookie settings" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={openCookieSettings}>
      {children}
    </button>
  );
}
