"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { hideSharedSky, isSpaceStudioSurface } from "./surface";

/**
 * The root layout mounts one cloud sky for the rest of the site. Space Studio leaves it unmounted, so the sky
 * never starts and never asks for weather.
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
    if (exempt || isSpaceStudioSurface(window.location.hostname, path)) root.setAttribute("data-space-studio", "");
    else root.removeAttribute("data-space-studio");
  }, [exempt, path]);
  if (exempt) return null;
  return children;
}
