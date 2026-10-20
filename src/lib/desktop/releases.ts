/**
 * Latest desktop release, read from the GitHub repo's Releases API on the server (never from the browser).
 *
 * Honesty rules: a file is listed only if it is an uploaded asset of the release, named Keplar-One-<version>-<os>-<arch>.<ext>
 * (releases before v0.1.2 used Keplar-<version>-...; Keplar Business files are Keplar-Business-<version>-...),
 * and served from this repo's own github.com release path. A checksum is shown only when SHA256SUMS lists that exact file.
 * No release, a rate limit or a network failure each produce an explicit state; nothing is ever invented.
 * A 404 from the releases API is "unavailable", never "none": GitHub uses 404 for a private repository as well as a missing one,
 * and both desktop apps have already shipped. "none" is only an empty public release list.
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
/**
 * `releasesPublic: false` means the public GitHub releases page is not available (private or missing), so the UI must not link to it.
 * Omitted when that page is public, or when a check could not tell.
 */
export type ReleaseState =
  | { status: "ok"; release: DesktopRelease; releasesPublic?: boolean }
  | { status: "none"; releasesPublic?: boolean }
  | { status: "unavailable"; reason: "rate_limited" | "error"; releasesPublic?: boolean };

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

type GhAsset = { name?: unknown; size?: unknown; state?: unknown; browser_download_url?: unknown; url?: unknown };
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
type PageVisibility = "public" | "private" | "unknown";
type FeedState = "empty" | "present" | "missing" | "unknown";

const TAG_RE = /^v\d+\.\d+\.\d+(?:[.+-][0-9A-Za-z.-]+)?$/;
const ASSET_HOSTS = new Set(["release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"]);

/** The public releases page, without a token. 404 and login redirects mean it is not public; anything else is not proof of that. */
export async function releasesPageVisibility(doFetch: Fetch = fetch, product: DesktopProduct = "one"): Promise<PageVisibility> {
  try {
    const res = await doFetch(releasesPage(product), { redirect: "manual", headers: { "User-Agent": "keplar-one-download-page", Accept: "text/html" }, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(6000) } as RequestInit);
    if (res.status === 404 || res.status === 401 || (res.status >= 300 && res.status < 400)) return "private";
    if (res.ok) return "public";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Public Atom feed: empty (a real "no releases"), present, missing (404) or unknown. */
async function publicFeed(doFetch: Fetch, product: DesktopProduct): Promise<FeedState> {
  try {
    const res = await doFetch(`${releasesPage(product)}.atom`, { headers: { "User-Agent": "keplar-one-download-page" }, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(6000) } as RequestInit);
    if (res.status === 404 || res.status === 401) return "missing";
    if (!res.ok) return "unknown";
    const text = await res.text();
    if (text.length >= 200_000 || !/<feed[\s>]/.test(text)) return "unknown";
    return /<entry[\s>]/.test(text) ? "present" : "empty";
  } catch {
    return "unknown";
  }
}

/** GitHub's API URL for one uploaded asset (`/releases/assets/<id>`), or null. Never a browser download URL. */
function githubAssetApiUrl(raw: unknown, name: string, repo: string): string | null {
  const assets = (raw as GhRelease).assets;
  if (!Array.isArray(assets)) return null;
  const prefix = `https://api.github.com/repos/${repo}/releases/assets/`;
  for (const a of assets as GhAsset[]) {
    if (!a || a.name !== name || typeof a.url !== "string") continue;
    if (a.state !== undefined && a.state !== "uploaded") continue;
    if (a.url.startsWith(prefix) && /^[0-9]+$/.test(a.url.slice(prefix.length))) return a.url;
  }
  return null;
}

/** Same-origin download URL for one installer or SHA256SUMS. Null when the name or tag is not one we publish. */
export function desktopDownloadHref(product: DesktopProduct, tag: string, file: string): string | null {
  if (product !== "one" && product !== "business") return null;
  if (tag.length > 64 || !TAG_RE.test(tag)) return null;
  if (file.length > 180 || /[/\\]|\.\./.test(file)) return null;
  if (file !== "SHA256SUMS" && !parseAssetName(file, product)) return null;
  return `/api/desktop/download?${new URLSearchParams({ product, tag, file })}`;
}

/** A redirect GitHub gives us for an asset. Only GitHub's own asset hosts, and never a URL that contains the token. */
export function safeReleaseAssetLocation(location: string, repo: string, secret = ""): string | null {
  let u: URL;
  try {
    u = new URL(location);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const ownDownload = u.hostname === "github.com" && u.pathname.startsWith(`/${repo}/releases/download/`);
  if (!ASSET_HOSTS.has(u.hostname) && !ownDownload) return null;
  const out = u.toString();
  if (secret && out.includes(secret)) return null;
  return out;
}

const plain = (status: number, message: string, extra: Record<string, string> = {}) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });

/**
 * Serves one desktop asset. With `GITHUB_RELEASES_TOKEN`, asks GitHub for the asset and redirects the browser to the
 * short-lived URL GitHub returns. The token is never copied into that redirect or into an error. Without the token, 404.
 */
export async function openDesktopAsset(product: DesktopProduct, tag: string, file: string, doFetch: Fetch = fetch): Promise<Response> {
  const token = process.env.GITHUB_RELEASES_TOKEN;
  if (!token || !desktopDownloadHref(product, tag, file)) return plain(404, "Not found");
  const repo = DESKTOP_PRODUCTS[product].repo;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "keplar-one-download-page", "X-GitHub-Api-Version": "2022-11-28" };
  try {
    const rel = await doFetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!rel.ok) return plain(404, "Not found");
    const body = (await rel.json()) as GhRelease;
    if (!body || body.draft === true || body.prerelease === true || body.tag_name !== tag) return plain(404, "Not found");
    const api = githubAssetApiUrl(body, file, repo);
    if (!api) return plain(404, "Not found");
    const dl = await doFetch(api, { headers: { ...headers, Accept: "application/octet-stream" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    const loc = dl.headers.get("location");
    if (loc && (dl.status === 301 || dl.status === 302 || dl.status === 307 || dl.status === 308)) {
      const safe = safeReleaseAssetLocation(loc, repo, token);
      if (!safe) return plain(404, "Not found");
      return new Response(null, { status: 302, headers: { location: safe, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
    }
    if (dl.status === 200 && dl.body) {
      const out = new Headers();
      out.set("content-type", "application/octet-stream");
      out.set("content-disposition", `attachment; filename="${file.replace(/["\r\n]/g, "")}"`);
      const len = dl.headers.get("content-length");
      if (len && /^\d+$/.test(len)) out.set("content-length", len);
      out.set("cache-control", "private, no-store");
      out.set("x-content-type-options", "nosniff");
      return new Response(dl.body, { status: 200, headers: out });
    }
    return plain(404, "Not found");
  } catch {
    return plain(503, "Downloads are temporarily unavailable", { "retry-after": "60" });
  }
}

/**
 * Reads the latest release. `revalidate` caches the response ~10 minutes in Next's data cache. An optional
 * `GITHUB_RELEASES_TOKEN` (read access to the desktop repos) raises the API limit and, when the releases page is not
 * public, lets the server fetch files. The token is never sent to the browser: private files are served from /api/desktop/download.
 */
export async function getDesktopRelease(doFetch: Fetch = fetch, product: DesktopProduct = "one"): Promise<ReleaseState> {
  const token = process.env.GITHUB_RELEASES_TOKEN || "";
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "keplar-one-download-page" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { headers, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8000) } as RequestInit;
  try {
    const res = await doFetch(`https://api.github.com/repos/${DESKTOP_PRODUCTS[product].repo}/releases?per_page=15`, opts);
    // 404 is never "none". GitHub returns 404 for a private repo, which would otherwise look like the app was never released.
    if (res.status === 404) return { status: "unavailable", reason: "error", releasesPublic: false };
    if (res.status === 403 || res.status === 429 || !res.ok) {
      // The API is limited per IP (and Vercel's addresses are shared). The public Atom feed isn't: if it shows no releases at all,
      // the honest answer is still "none yet". If it shows releases we can't read their files, so we say unavailable.
      // A missing feed (404) is a private or gone repo, not an empty one.
      const reason = res.status === 403 || res.status === 429 ? "rate_limited" : "error";
      const feed = await publicFeed(doFetch, product);
      if (feed === "empty") return { status: "none" };
      return { status: "unavailable", reason, ...(feed === "missing" ? { releasesPublic: false } : {}) };
    }
    const picked = pickLatest(await res.json());
    if (!picked) return { status: "none" };
    const repo = DESKTOP_PRODUCTS[product].repo;
    let visibility: PageVisibility | undefined;
    const pageVisibility = async (): Promise<PageVisibility> => {
      if (!token) return "public";
      visibility ??= await releasesPageVisibility(doFetch, product);
      return visibility;
    };
    let sums = new Map<string, string>();
    const first = parseRelease(picked, new Map(), product);
    if (first?.checksumsUrl) {
      const api = githubAssetApiUrl(picked, "SHA256SUMS", repo);
      const viaApi = Boolean(api && token && (await pageVisibility()) !== "public");
      try {
        const s = await doFetch(viaApi && api ? api : first.checksumsUrl, {
          headers: viaApi ? { ...headers, Accept: "application/octet-stream" } : { "User-Agent": "keplar-one-download-page" },
          redirect: "follow",
          next: { revalidate: REVALIDATE_SECONDS },
          signal: AbortSignal.timeout(8000),
        } as RequestInit);
        const text = s.ok ? await s.text() : "";
        if (text.length <= 100_000) sums = parseSha256Sums(text);
      } catch {
        /* checksums are optional: the table then shows "not published" */
      }
    }
    const release = parseRelease(picked, sums, product);
    if (!release) return { status: "none" };
    if (token && (await pageVisibility()) !== "public") {
      for (const f of release.files) {
        const href = desktopDownloadHref(product, release.tag, f.name);
        if (href) f.url = href;
      }
      if (release.checksumsUrl) {
        const href = desktopDownloadHref(product, release.tag, "SHA256SUMS");
        if (href) release.checksumsUrl = href;
      }
      if (visibility === "private") release.notesUrl = "";
      return { status: "ok", release, ...(visibility === "private" ? { releasesPublic: false } : {}) };
    }
    return { status: "ok", release };
  } catch {
    return { status: "unavailable", reason: "error" };
  }
}
