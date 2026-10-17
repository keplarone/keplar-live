"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isSpaceStudioSurface } from "./surface";

/**
 * The root layout mounts one cloud sky for the rest of the site. Space Studio opts out: the host
 * (space.keplar.one) and any /space-studio route leave this empty, so the sky never starts and never asks for weather.
 * The path is known during server render. The host is applied in useLayoutEffect, before the sky's effect can fetch.
 */
export function SpaceSkyExempt({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const [host, setHost] = useState("");
  useLayoutEffect(() => {
    const next = window.location.hostname;
    // Hostname is only on the window. Apply it before paint so the sky unmounts before it can ask for weather.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- host is external (location); the route is already known from usePathname
    setHost(next);
    const root = document.documentElement;
    if (isSpaceStudioSurface(next, path)) root.setAttribute("data-space-studio", "");
    else root.removeAttribute("data-space-studio");
  }, [path]);
  if (isSpaceStudioSurface(host, path)) return null;
  return children;
}
