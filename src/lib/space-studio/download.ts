/**
 * Direct Space Studio downloads: GET /api/space-studio/download?os=... answers with a redirect to the installer file of the
 * latest GitHub release, so the Download buttons start the download instead of opening the releases page.
 */

export const RELEASES_URL = "https://github.com/keplarone/space-studio/releases/latest";
const LATEST_API = "https://api.github.com/repos/keplarone/space-studio/releases/latest";

export type Platform = "windows" | "mac-arm" | "mac-intel" | "linux" | "deb";
export const PLATFORMS: Platform[] = ["windows", "mac-arm", "mac-intel", "linux", "deb"];

/** Which release asset each platform gets (names as release.yml builds them, e.g. Space-Studio-0.2.0-mac-arm64.dmg). */
const ASSET: Record<Platform, RegExp> = {
  windows: /-win-x64\.exe$/,
  "mac-arm": /-mac-arm64\.dmg$/,
  "mac-intel": /-mac-x64\.dmg$/,
  linux: /-linux-x86_64\.AppImage$/,
  deb: /-linux-amd64\.deb$/,
};

export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as string[]).includes(v);

/**
 * Best guess from the request when the page couldn't tell. macOS user agents say "Intel" even on Apple silicon, so a Mac
 * defaults to the Apple silicon build unless a client hint says x86.
 */
export function platformFromRequest(userAgent: string | null, archHint: string | null): Platform {
  const ua = userAgent ?? "";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return /x86/i.test(archHint ?? "") ? "mac-intel" : "mac-arm";
  if (/Ubuntu|Debian/i.test(ua)) return "deb";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}

type Release = { tag_name?: string; assets?: { name?: string; browser_download_url?: string }[] };

/** The installer URL for a platform, or null when the release or the asset can't be found. Only github.com URLs are returned. */
export function assetUrl(release: Release, platform: Platform): string | null {
  const a = release.assets?.find((x) => typeof x.name === "string" && ASSET[platform].test(x.name));
  const url = a?.browser_download_url;
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" && u.pathname.startsWith("/keplarone/space-studio/releases/download/") ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function latestRelease(fetcher: typeof fetch = fetch): Promise<Release | null> {
  try {
    const res = await fetcher(LATEST_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "keplar.one" },
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 300 },
    } as RequestInit);
    return res.ok ? ((await res.json()) as Release) : null;
  } catch {
    return null;
  }
}
