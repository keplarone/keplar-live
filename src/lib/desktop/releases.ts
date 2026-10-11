/**
 * Latest desktop release, read from the public GitHub repo's Releases API on the server (never from the browser).
 *
 * Honesty rules: a file is listed only if it is an uploaded asset of the release, named Keplar-One-<version>-<os>-<arch>.<ext>
 * (releases before v0.1.2 used Keplar-<version>-...; Keplar Business files are Keplar-Business-<version>-...),
 * and served from this repo's own github.com release path. A checksum is shown only when SHA256SUMS lists that exact file.
 * No release, a rate limit or a network failure each produce an explicit state; nothing is ever invented.
 */
export const DESKTOP_REPO = "keplarone/keplar-desktop";
export const RELEASES_PAGE = `https://github.com/${DESKTOP_REPO}/releases`;

/**
 * The two desktop apps, each released from its own public repo: Keplar One (keplar-desktop, files Keplar-One-...) and
 * Keplar Business (keplar-business, files Keplar-Business-...). Every function below takes the product; Keplar One is the default.
 */
export type DesktopProduct = "one" | "business";
export const DESKTOP_PRODUCTS: Record<DesktopProduct, { repo: string; filePrefix: RegExp }> = {
  one: { repo: DESKTOP_REPO, filePrefix: /^Keplar(?:-One)?-/ },
  business: { repo: "keplarone/keplar-business", filePrefix: /^Keplar-Business-/ },
};
export const releasesPage = (product: DesktopProduct = "one") => `https://github.com/${DESKTOP_PRODUCTS[product].repo}/releases`;
export const REVALIDATE_SECONDS = 600;

export type DesktopOs = "windows" | "macos" | "linux";
export type DesktopArch = "x64" | "arm64" | "universal";
export type DesktopFile = {
  name: string;
  url: string;
  os: DesktopOs;
  arch: DesktopArch;
  /** exe, dmg, zip, AppImage, deb, rpm, msi, pkg or tar.gz */
  type: string;
  size: number;
  sha256: string | null;
};
export type DesktopRelease = { tag: string; version: string; name: string; publishedAt: string | null; notesUrl: string; files: DesktopFile[]; checksumsUrl: string | null };
export type ReleaseState =
  | { status: "ok"; release: DesktopRelease }
  | { status: "none" }
  | { status: "unavailable"; reason: "rate_limited" | "error" };

const OS_WORDS: Record<string, DesktopOs> = { win: "windows", windows: "windows", mac: "macos", macos: "macos", darwin: "macos", linux: "linux" };
const ARCH_WORDS: Record<string, DesktopArch> = { x64: "x64", x86_64: "x64", amd64: "x64", arm64: "arm64", aarch64: "arm64", universal: "universal" };
const TYPES = ["exe", "msi", "dmg", "pkg", "zip", "AppImage", "deb", "rpm", "tar.gz"];
const NAME_RE = /^(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+?)?)-([A-Za-z]+)-([A-Za-z0-9_]+)\.(exe|msi|dmg|pkg|zip|AppImage|deb|rpm|tar\.gz)$/;

/** Parses one asset name; null when it doesn't follow the naming scheme (those files are simply not listed). */
export function parseAssetName(name: string, product: DesktopProduct = "one"): { version: string; os: DesktopOs; arch: DesktopArch; type: string } | null {
  const prefix = DESKTOP_PRODUCTS[product].filePrefix.exec(name);
  if (!prefix) return null;
  const m = NAME_RE.exec(name.slice(prefix[0].length));
  if (!m) return null;
  const os = OS_WORDS[m[2].toLowerCase()];
  const arch = ARCH_WORDS[m[3].toLowerCase()];
  if (!os || !arch || !TYPES.includes(m[4])) return null;
  return { version: m[1], os, arch, type: m[4] };
}

/** `<64 hex>  name` or `<64 hex> *name` lines (sha256sum output). Later duplicates are ignored; bad lines are skipped. */
export function parseSha256Sums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(?:\.\/)?([^\s/\\][^/\\]*?)\s*$/.exec(line.trim());
    if (m && !out.has(m[2])) out.set(m[2], m[1].toLowerCase());
  }
  return out;
}

type GhAsset = { name?: unknown; size?: unknown; state?: unknown; browser_download_url?: unknown };
type GhRelease = { tag_name?: unknown; name?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown; html_url?: unknown; assets?: unknown };

/** Turns one GitHub release JSON into our shape, or null when it is a draft/prerelease/unusable. `sums` maps file name to SHA-256. */
export function parseRelease(raw: unknown, sums: Map<string, string> = new Map(), product: DesktopProduct = "one"): DesktopRelease | null {
  const RELEASES_PAGE = releasesPage(product);
  const ASSET_PREFIX = `${RELEASES_PAGE}/download/`;
  const r = raw as GhRelease;
  if (!r || typeof r !== "object" || r.draft === true || r.prerelease === true) return null;
  const tag = typeof r.tag_name === "string" ? r.tag_name : "";
  if (!/^v\d+\.\d+\.\d+/.test(tag) || tag.length > 64) return null;
  const files: DesktopFile[] = [];
  let checksumsUrl: string | null = null;
  for (const a of Array.isArray(r.assets) ? (r.assets as GhAsset[]) : []) {
    if (!a || typeof a.name !== "string" || typeof a.browser_download_url !== "string") continue;
    if (a.state !== undefined && a.state !== "uploaded") continue;
    if (!a.browser_download_url.startsWith(`${ASSET_PREFIX}${encodeURIComponent(tag)}/`) && !a.browser_download_url.startsWith(`${ASSET_PREFIX}${tag}/`)) continue;
    if (a.name === "SHA256SUMS") {
      checksumsUrl = a.browser_download_url;
      continue;
    }
    const p = parseAssetName(a.name, product);
    const size = typeof a.size === "number" && Number.isFinite(a.size) && a.size > 0 ? a.size : 0;
    if (!p || !size) continue; // an empty or unfinished upload is not a download
    files.push({ name: a.name, url: a.browser_download_url, os: p.os, arch: p.arch, type: p.type, size, sha256: sums.get(a.name) ?? null });
  }
  const order = (f: DesktopFile) => ["windows", "macos", "linux"].indexOf(f.os) * 100 + ["x64", "arm64", "universal"].indexOf(f.arch) * 10 + TYPES.indexOf(f.type) / 10;
  files.sort((a, b) => order(a) - order(b));
  const notes = typeof r.html_url === "string" && r.html_url.startsWith(`${RELEASES_PAGE}/`) ? r.html_url : `${RELEASES_PAGE}/tag/${encodeURIComponent(tag)}`;
  const published = typeof r.published_at === "string" && !Number.isNaN(Date.parse(r.published_at)) ? r.published_at : null;
  return { tag, version: tag.slice(1), name: typeof r.name === "string" && r.name ? r.name.slice(0, 120) : tag, publishedAt: published, notesUrl: notes, files, checksumsUrl };
}

/** Picks the newest published, non-draft, non-prerelease `v*` release from a list response. */
export function pickLatest(list: unknown): unknown | null {
  if (!Array.isArray(list)) return null;
  let best: { r: GhRelease; t: number } | null = null;
  for (const r of list as GhRelease[]) {
    if (!r || r.draft === true || r.prerelease === true || typeof r.tag_name !== "string" || !/^v\d+\.\d+\.\d+/.test(r.tag_name)) continue;
    const t = typeof r.published_at === "string" ? Date.parse(r.published_at) : 0;
    if (!best || t > best.t) best = { r, t: Number.isNaN(t) ? 0 : t };
  }
  return best?.r ?? null;
}

type Fetch = typeof fetch;

/** True only when GitHub's public releases feed loads and has zero entries. Any doubt is false. */
async function feedIsEmpty(doFetch: Fetch, product: DesktopProduct): Promise<boolean> {
  try {
    const res = await doFetch(`${releasesPage(product)}.atom`, { headers: { "User-Agent": "keplar-one-download-page" }, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(6000) } as RequestInit);
    if (!res.ok) return false;
    const text = await res.text();
    return text.length < 200_000 && /<feed[\s>]/.test(text) && !/<entry[\s>]/.test(text);
  } catch {
    return false;
  }
}

/**
 * Reads the latest release. `revalidate` caches the response ~10 minutes in Next's data cache. An optional
 * `GITHUB_RELEASES_TOKEN` (read-only, public repo scope) raises the API limit; it is never required and never sent to the browser.
 */
export async function getDesktopRelease(doFetch: Fetch = fetch, product: DesktopProduct = "one"): Promise<ReleaseState> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "keplar-one-download-page" };
  if (process.env.GITHUB_RELEASES_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`;
  const opts = { headers, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8000) } as RequestInit;
  try {
    const res = await doFetch(`https://api.github.com/repos/${DESKTOP_PRODUCTS[product].repo}/releases?per_page=15`, opts);
    if (res.status === 404) return { status: "none" };
    if (res.status === 403 || res.status === 429 || !res.ok) {
      // The API is limited per IP (and Vercel's addresses are shared). The public Atom feed isn't: if it shows no releases at all,
      // the honest answer is still "none yet". If it shows releases we can't read their files, so we say unavailable.
      const reason = res.status === 403 || res.status === 429 ? "rate_limited" : "error";
      return (await feedIsEmpty(doFetch, product)) ? { status: "none" } : { status: "unavailable", reason };
    }
    const picked = pickLatest(await res.json());
    if (!picked) return { status: "none" };
    let sums = new Map<string, string>();
    const first = parseRelease(picked, new Map(), product);
    if (first?.checksumsUrl) {
      try {
        const s = await doFetch(first.checksumsUrl, { headers: { "User-Agent": "keplar-one-download-page" }, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8000) } as RequestInit);
        const text = s.ok ? await s.text() : "";
        if (text.length <= 100_000) sums = parseSha256Sums(text);
      } catch {
        /* checksums are optional: the table then shows "not published" */
      }
    }
    const release = parseRelease(picked, sums, product);
    return release ? { status: "ok", release } : { status: "none" };
  } catch {
    return { status: "unavailable", reason: "error" };
  }
}
