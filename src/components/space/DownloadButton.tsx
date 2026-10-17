"use client";

import { useEffect, useState } from "react";
import { spaceButtonAttrs, type SpaceButtonSize, type SpaceButtonVariant } from "@/components/ui/space";
import { OsIcon, type OsKind } from "./OsIcon";
import s from "./space.module.css";

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

const KIND: Record<Platform, OsKind> = { windows: "windows", "mac-arm": "mac", "mac-intel": "mac", linux: "linux", deb: "linux" };
const NAME: Record<OsKind, string> = { windows: "Windows", mac: "macOS", linux: "Linux" };

/**
 * "Download" (Space Studio's 3D primary button by default) with the visitor's platform logo (Windows, Apple or Linux) beside it. Starts the installer for this computer straight
 * away. Without JavaScript (or on phones) there is no logo and the server picks the file from the user agent.
 */
export function DownloadButton({ className, children = "Download", variant = "primary", size = "lg" }: { className?: string; children?: React.ReactNode; variant?: SpaceButtonVariant; size?: SpaceButtonSize }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    let alive = true;
    void detect().then((p) => { if (alive) setPlatform(p); });
    return () => { alive = false; };
  }, []);
  const kind = platform ? KIND[platform] : null;
  return (
    <a
      className={className ? `sp-btn ${className}` : "sp-btn"}
      {...spaceButtonAttrs({ variant, size })}
      href={platform ? `${BASE}?os=${platform}` : BASE}
      download
      rel="nofollow"
      aria-label={kind ? `Download for ${NAME[kind]}` : undefined}
    >
      {kind && <span className={`sp-btn__label ${s.osIcon}`}><OsIcon os={kind} size={17} /></span>}
      <span className="sp-btn__label">{children}</span>
    </a>
  );
}
