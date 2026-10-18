"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { WHOP_PIXEL_LOADER_SCRIPT, WHOP_PIXEL_OPTIONS_SCRIPT, whopPixelAllowed } from "@/lib/whop-pixel";

/**
 * Whop Pixel as inline scripts, mounted only by the checkout and account layouts (not the root layout). The inline script is a
 * small loader: Whop's snippet itself runs after window load + idle or on the first user interaction (see WHOP_PIXEL_LOADER_SCRIPT).
 * whopPixelAllowed() is a second check, so a mistaken mount on /, /pricing, or any other route still renders nothing.
 */
export function WhopPixel() {
  const pathname = usePathname();
  const [load] = useState(() => whopPixelAllowed(pathname));
  if (!load) return null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: WHOP_PIXEL_OPTIONS_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: WHOP_PIXEL_LOADER_SCRIPT }} />
    </>
  );
}
