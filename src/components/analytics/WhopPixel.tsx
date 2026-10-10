"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { WHOP_PIXEL_LOADER_SCRIPT, WHOP_PIXEL_OPTIONS_SCRIPT, whopPixelAllowed } from "@/lib/whop-pixel";

/**
 * Whop Pixel as an inline <script> in the root layout <head> (so it is in the server HTML of every static public page). The inline script is a
 * small loader: Whop's snippet itself runs after window load + idle or on the first user interaction (see WHOP_PIXEL_LOADER_SCRIPT).
 * Decided once, from the path the visit started on: it never appears or disappears on in-app navigation, which also keeps React from
 * creating a script element on the client (those do not run). Signed-in, checkout and form pages are excluded; see src/lib/whop-pixel.ts.
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
