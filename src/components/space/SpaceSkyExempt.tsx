"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { hideSharedSky, isChatSurface, isProductHost, isSpaceStudioSurface } from "./surface";

/**
 * Marks chat and Space Studio on the document. The cloud sky is not mounted here: marketing layouts
 * mount MarketingSky, and this component only keeps data-app-surface and data-space-studio in step
 * when the visitor navigates.
 *
 * The rewritten space host disagrees with the address bar on the first render ("/space-studio" on the server,
 * "/" in the browser). hideSharedSky treats those as the same page: the path, or the flag the head script sets
 * for space.keplar.one. The attribute below is applied after hydration and only feeds CSS.
 */
export function SpaceSkyExempt({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const exempt = hideSharedSky(path);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const host = window.location.hostname;
    // Chat surfaces are solid. Marketing pages keep the sky. Other hosts' "/" is not the chat.
    if (isProductHost(host) && isChatSurface(path)) root.setAttribute("data-app-surface", "");
    else root.removeAttribute("data-app-surface");
    if (exempt || isSpaceStudioSurface(host, path)) root.setAttribute("data-space-studio", "");
    else root.removeAttribute("data-space-studio");
  }, [exempt, path]);
  if (exempt) return null;
  return children;
}
