"use client";

import { useEffect, useState } from "react";

type Platform = "windows" | "mac-arm" | "mac-intel" | "linux" | "deb";
const BASE = "/api/space-studio/download";

/** Apple silicon or Intel? Chromium says so through client hints; Safari and Firefox reveal it through the GPU name. */
async function macArch(): Promise<"arm" | "intel"> {
  const nav = navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } };
  try {
    const v = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]);
    if (v?.architecture) return /x86/i.test(v.architecture) ? "intel" : "arm";
  } catch { /* fall through */ }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) ?? gl?.getParameter(gl.RENDERER) ?? "");
    if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer)) return "intel";
  } catch { /* fall through */ }
  return "arm";
}

async function detect(): Promise<Platform | null> {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua) && navigator.maxTouchPoints <= 1) return (await macArch()) === "intel" ? "mac-intel" : "mac-arm";
  if (/Ubuntu|Debian/i.test(ua)) return "deb";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return null; // phones and tablets: let the server pick (the link still works)
}

/** "Download": starts the installer for this computer straight away. Without JavaScript the server picks from the user agent. */
export function DownloadButton({ className, children = "Download" }: { className?: string; children?: React.ReactNode }) {
  const [href, setHref] = useState(BASE);
  useEffect(() => {
    let alive = true;
    void detect().then((p) => { if (alive && p) setHref(`${BASE}?os=${p}`); });
    return () => { alive = false; };
  }, []);
  return <a className={className} href={href} download rel="nofollow">{children}</a>;
}
