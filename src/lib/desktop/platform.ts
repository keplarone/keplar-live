import type { DesktopArch, DesktopFile, DesktopOs } from "./releases";

export type Platform = { os: DesktopOs | "ios" | "android" | "other"; arch: "x64" | "arm64" | null; mobile: boolean };
export type Hints = { ua?: string; platform?: string; mobile?: boolean; architecture?: string; bitness?: string; touchPoints?: number };

/** Best-effort OS/arch from the user agent and (when the browser offers them) client hints. Arch stays null when it can't be known. */
export function detectPlatform(h: Hints): Platform {
  const ua = h.ua ?? "";
  const plat = (h.platform ?? "").toLowerCase();
  const ipadDesktopUa = /Macintosh/.test(ua) && (h.touchPoints ?? 0) > 1; // iPadOS reports a Mac
  if (/Android/i.test(ua)) return { os: "android", arch: null, mobile: true };
  if (/iPhone|iPad|iPod/.test(ua) || ipadDesktopUa) return { os: "ios", arch: null, mobile: true };
  if (h.mobile === true) return { os: "other", arch: null, mobile: true };
  let os: Platform["os"] = "other";
  if (/Windows|Win32|Win64/i.test(ua) || plat.startsWith("win")) os = "windows";
  else if (/Mac OS X|Macintosh/.test(ua) || plat.startsWith("mac")) os = "macos";
  else if (/CrOS/.test(ua)) os = "other"; // ChromeOS can't install these
  else if (/Linux|X11/.test(ua) || plat.includes("linux")) os = "linux";
  let arch: Platform["arch"] = null;
  const a = (h.architecture ?? "").toLowerCase();
  if (a === "arm") arch = "arm64";
  else if (a === "x86") arch = h.bitness === "32" ? null : "x64";
  else if (/aarch64|arm64/i.test(ua)) arch = "arm64";
  else if (os === "windows" && /Win64|x64|WOW64/i.test(ua)) arch = "x64";
  else if (os === "linux" && /x86_64|amd64/i.test(ua)) arch = "x64";
  return { os, arch, mobile: false };
}

const PREFERRED: Record<DesktopOs, string[]> = {
  windows: ["exe", "msi", "zip"],
  macos: ["dmg", "pkg", "zip"],
  linux: ["AppImage", "deb", "rpm", "tar.gz"],
};

export type Pick = { file: DesktopFile; exact: boolean };

/**
 * The files to offer as the main button for a platform. `exact` is false when the file is not known to match the visitor's
 * architecture (the page then says so). On macOS with an unknown chip both builds are returned so the visitor chooses.
 */
export function pickPrimary(files: DesktopFile[], p: Platform): Pick[] {
  if (p.os !== "windows" && p.os !== "macos" && p.os !== "linux") return [];
  const mine = files.filter((f) => f.os === p.os);
  if (!mine.length) return [];
  const rank = (f: DesktopFile) => PREFERRED[p.os as DesktopOs].indexOf(f.type);
  const best = (arch: DesktopArch) => mine.filter((f) => f.arch === arch && rank(f) >= 0).sort((a, b) => rank(a) - rank(b))[0];
  const universal = best("universal");
  if (p.arch) {
    const f = best(p.arch) ?? universal;
    if (f) return [{ file: f, exact: true }];
    const other = best(p.arch === "arm64" ? "x64" : "arm64");
    return other ? [{ file: other, exact: false }] : [];
  }
  if (universal) return [{ file: universal, exact: true }];
  const x64 = best("x64");
  const arm = best("arm64");
  if (p.os === "macos" && x64 && arm) return [{ file: arm, exact: true }, { file: x64, exact: true }]; // the browser can't tell Apple silicon from Intel
  const one = x64 ?? arm;
  return one ? [{ file: one, exact: one.arch === "x64" && p.os !== "macos" }] : []; // x64 is the safe default off macOS
}

export const OS_LABEL: Record<DesktopOs, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
export const ARCH_LABEL: Record<DesktopOs, Record<DesktopArch, string>> = {
  windows: { x64: "64-bit (x64)", arm64: "ARM64", universal: "Universal" },
  macos: { x64: "Intel", arm64: "Apple silicon", universal: "Universal (Intel + Apple silicon)" },
  linux: { x64: "x64", arm64: "ARM64", universal: "Universal" },
};
export const TYPE_LABEL: Record<string, string> = { exe: "Installer (.exe)", msi: "Installer (.msi)", dmg: "Disk image (.dmg)", pkg: "Package (.pkg)", zip: "Zip archive (.zip)", AppImage: "AppImage", deb: "Debian/Ubuntu (.deb)", rpm: "Fedora/RHEL (.rpm)", "tar.gz": "Tarball (.tar.gz)" };

export function formatSize(bytes: number): string {
  if (!(bytes > 0)) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
