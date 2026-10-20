import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopDownloadHref, getDesktopRelease, openDesktopAsset, parseAssetName, parseRelease, parseSha256Sums, pickLatest, releasesPageVisibility, safeReleaseAssetLocation, DESKTOP_REPO } from "../src/lib/desktop/releases";
import { detectPlatform, formatSize, pickPrimary } from "../src/lib/desktop/platform";
import { downloadPageGraph } from "../src/lib/structuredData";
import { primaryNav, footerNav } from "../src/lib/site";
import sitemap from "../src/app/sitemap";
import { readFileSync } from "node:fs";

const base = `https://github.com/${DESKTOP_REPO}/releases/download/v1.2.3/`;
const asset = (name: string, size = 1_000_000, extra: Record<string, unknown> = {}) => ({ name, size, state: "uploaded", browser_download_url: base + name, ...extra });
const H = (c: string) => c.repeat(64);

const rel = (over: Record<string, unknown> = {}) => ({
  tag_name: "v1.2.3",
  name: "Keplar 1.2.3",
  draft: false,
  prerelease: false,
  published_at: "2026-10-05T12:00:00Z",
  html_url: `https://github.com/${DESKTOP_REPO}/releases/tag/v1.2.3`,
  assets: [
    asset("Keplar-1.2.3-win-x64.exe", 90_000_000),
    asset("Keplar-1.2.3-mac-arm64.dmg", 110_000_000),
    asset("Keplar-1.2.3-mac-x64.dmg", 115_000_000),
    asset("Keplar-1.2.3-linux-x64.AppImage", 100_000_000),
    asset("Keplar-1.2.3-linux-x64.deb", 80_000_000),
    asset("Keplar-1.2.3-linux-arm64.rpm", 80_000_000),
    asset("SHA256SUMS", 400),
  ],
  ...over,
});

test("asset names: os/arch aliases and types parse; anything off-scheme is not a download", () => {
  assert.deepEqual(parseAssetName("Keplar-1.2.3-win-x64.exe"), { version: "1.2.3", os: "windows", arch: "x64", type: "exe" });
  assert.deepEqual(parseAssetName("Keplar-1.2.3-macos-aarch64.zip"), { version: "1.2.3", os: "macos", arch: "arm64", type: "zip" });
  assert.deepEqual(parseAssetName("Keplar-1.2.3-linux-amd64.AppImage"), { version: "1.2.3", os: "linux", arch: "x64", type: "AppImage" });
  assert.equal(parseAssetName("Keplar-1.2.3-mac-universal.dmg")?.arch, "universal");
  assert.equal(parseAssetName("Keplar-1.2.3-linux-x64.tar.gz")?.type, "tar.gz");
  for (const bad of ["Keplar-1.2.3-plan9-x64.exe", "Keplar-1.2.3-win-x64.sh", "keplar-1.2.3-win-x64.exe", "Keplar-1.2-win-x64.exe", "Keplar-1.2.3-win-x64.exe.blockmap", "../Keplar-1.2.3-win-x64.exe", "latest.yml"]) assert.equal(parseAssetName(bad), null, bad);
});

test("SHA256SUMS: sha256sum formats parse, bad lines and duplicates are ignored", () => {
  const m = parseSha256Sums([`${H("a")}  Keplar-1.2.3-win-x64.exe`, `${H("B")} *Keplar-1.2.3-mac-arm64.dmg`, `${H("c")}  ./Keplar-1.2.3-linux-x64.deb`, "nothex  file", `${H("d")}  Keplar-1.2.3-win-x64.exe`, `${H("e")}  sub/dir/x`, ""].join("\r\n"));
  assert.equal(m.get("Keplar-1.2.3-win-x64.exe"), H("a"));
  assert.equal(m.get("Keplar-1.2.3-mac-arm64.dmg"), H("b"));
  assert.equal(m.get("Keplar-1.2.3-linux-x64.deb"), H("c"));
  assert.equal(m.size, 3);
});

test("release: only uploaded, correctly named, same-repo files are listed; checksums only for exact matches", () => {
  const r = parseRelease(
    rel({
      assets: [
        asset("Keplar-1.2.3-win-x64.exe", 90_000_000),
        asset("Keplar-1.2.3-win-arm64.exe", 90_000_000, { state: "starter" }), // unfinished upload
        asset("Keplar-1.2.3-mac-arm64.dmg", 0), // empty
        asset("Keplar-1.2.3-linux-x64.deb", 5, { browser_download_url: "https://evil.example/Keplar-1.2.3-linux-x64.deb" }), // foreign host
        asset("Keplar-1.2.3-linux-x64.AppImage", 5, { browser_download_url: `https://github.com/other/repo/releases/download/v1.2.3/Keplar-1.2.3-linux-x64.AppImage` }),
        asset("notes.txt", 10),
        asset("SHA256SUMS", 100),
      ],
    }),
    new Map([["Keplar-1.2.3-win-x64.exe", H("a")], ["Keplar-1.2.3-mac-arm64.dmg", H("b")]]),
  )!;
  assert.deepEqual(r.files.map((f) => f.name), ["Keplar-1.2.3-win-x64.exe"]);
  assert.equal(r.files[0].sha256, H("a"));
  assert.equal(r.version, "1.2.3");
  assert.equal(r.checksumsUrl, base + "SHA256SUMS");
  assert.ok(r.notesUrl.startsWith(`https://github.com/${DESKTOP_REPO}/releases/`));
  const all = parseRelease(rel(), new Map())!;
  assert.equal(all.files.length, 6);
  assert.ok(all.files.every((f) => f.sha256 === null)); // no SHA256SUMS content => honest "not published"
  assert.deepEqual(all.files.map((f) => f.os), ["windows", "macos", "macos", "linux", "linux", "linux"]);
});

test("release: drafts, prereleases and non-version tags are skipped; the newest published release wins", () => {
  assert.equal(parseRelease(rel({ draft: true })), null);
  assert.equal(parseRelease(rel({ prerelease: true })), null);
  assert.equal(parseRelease(rel({ tag_name: "nightly" })), null);
  assert.equal(parseRelease("nope"), null);
  const newest = pickLatest([rel({ tag_name: "v1.0.0", published_at: "2026-01-01T00:00:00Z" }), rel({ tag_name: "v1.3.0", published_at: "2026-09-01T00:00:00Z" }), rel({ tag_name: "v2.0.0-rc1", prerelease: true, published_at: "2026-10-01T00:00:00Z" }), rel({ tag_name: "v9.9.9", draft: true })]) as { tag_name: string };
  assert.equal(newest.tag_name, "v1.3.0");
  assert.equal(pickLatest([]), null);
  assert.equal(pickLatest({ message: "x" }), null);
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeFetch = (routes: (url: string) => Response | Promise<Response>) => (async (u: string | URL | Request) => routes(String(u))) as typeof fetch;

test("fetch: an empty public list is 'none'; a releases API 404 is 'unavailable', never 'none'", async () => {
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => json([]))), { status: "none" });
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => json([rel({ draft: true }), rel({ prerelease: true })]))), { status: "none" });
  // GitHub returns 404 for a private repo. That must not be described as "not released yet", even if a feed looks empty.
  const emptyFeed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Releases</title></feed>`;
  for (const product of ["one", "business"] as const) {
    const got = await getDesktopRelease(fakeFetch((u) => (u.endsWith(".atom") ? new Response(emptyFeed) : json({ message: "Not Found" }, 404))), product);
    assert.equal(got.status, "unavailable", product);
    assert.notEqual(got.status, "none");
    if (got.status === "unavailable") {
      assert.equal(got.reason, "error");
      assert.equal(got.releasesPublic, false);
    }
  }
});

test("fetch: when the API is rate limited, an empty public feed still means 'none'; a feed with releases means unavailable", async () => {
  const feed = (entries: number) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Releases</title>${"<entry><title>v1</title></entry>".repeat(entries)}</feed>`;
  const route = (entries: number | null) => fakeFetch((u) => (u.endsWith(".atom") ? (entries === null ? new Response("x", { status: 500 }) : new Response(feed(entries))) : json({ message: "rate limit" }, 403)));
  assert.deepEqual(await getDesktopRelease(route(0)), { status: "none" });
  assert.deepEqual(await getDesktopRelease(route(1)), { status: "unavailable", reason: "rate_limited" });
  assert.deepEqual(await getDesktopRelease(route(null)), { status: "unavailable", reason: "rate_limited" });
});

test("fetch: rate limit, server errors and network failures are 'unavailable', never a fake release", async () => {
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => json({ message: "API rate limit exceeded" }, 403))), { status: "unavailable", reason: "rate_limited" });
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => json({}, 429))), { status: "unavailable", reason: "rate_limited" });
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => json({}, 502))), { status: "unavailable", reason: "error" });
  assert.deepEqual(await getDesktopRelease((async () => { throw new Error("offline"); }) as typeof fetch), { status: "unavailable", reason: "error" });
  assert.deepEqual(await getDesktopRelease(fakeFetch(() => new Response("<html>", { status: 200 }))), { status: "unavailable", reason: "error" });
});

test("fetch: latest release with SHA256SUMS attaches checksums; a broken SHA256SUMS only drops the checksums", async () => {
  const sums = `${H("a")}  Keplar-1.2.3-win-x64.exe\n${H("b")}  Keplar-1.2.3-mac-arm64.dmg\n`;
  const ok = await getDesktopRelease(fakeFetch((u) => (u.endsWith("SHA256SUMS") ? new Response(sums) : json([rel()]))));
  assert.equal(ok.status, "ok");
  if (ok.status === "ok") {
    assert.equal(ok.release.files.find((f) => f.name.endsWith("win-x64.exe"))?.sha256, H("a"));
    assert.equal(ok.release.files.find((f) => f.name.endsWith("linux-x64.deb"))?.sha256, null);
  }
  const broken = await getDesktopRelease(fakeFetch((u) => (u.endsWith("SHA256SUMS") ? new Response("", { status: 404 }) : json([rel()]))));
  assert.equal(broken.status === "ok" && broken.release.files.length, 6);
  assert.ok(broken.status === "ok" && broken.release.files.every((f) => f.sha256 === null));
});

test("OS detection: desktop, mobile, iPadOS and client hints", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18 Safari/605.1.15";
  const lin = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
  assert.deepEqual(detectPlatform({ ua: win }), { os: "windows", arch: "x64", mobile: false });
  assert.deepEqual(detectPlatform({ ua: win, architecture: "arm" }), { os: "windows", arch: "arm64", mobile: false });
  assert.deepEqual(detectPlatform({ ua: mac }), { os: "macos", arch: null, mobile: false }); // Safari hides Apple silicon vs Intel
  assert.deepEqual(detectPlatform({ ua: mac, architecture: "arm" }), { os: "macos", arch: "arm64", mobile: false });
  assert.deepEqual(detectPlatform({ ua: mac, architecture: "x86", bitness: "64" }), { os: "macos", arch: "x64", mobile: false });
  assert.deepEqual(detectPlatform({ ua: lin }), { os: "linux", arch: "x64", mobile: false });
  assert.deepEqual(detectPlatform({ ua: "Mozilla/5.0 (X11; Linux aarch64) Chrome/130" }), { os: "linux", arch: "arm64", mobile: false });
  assert.equal(detectPlatform({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari" }).mobile, true);
  assert.equal(detectPlatform({ ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile" }).os, "android");
  assert.equal(detectPlatform({ ua: mac, touchPoints: 5 }).os, "ios"); // iPad reporting a Mac
  assert.equal(detectPlatform({ ua: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/130" }).os, "other");
  assert.equal(detectPlatform({ ua: "" }).os, "other");
});

test("primary download: matches the platform, never offers a file that is not in the release", () => {
  const files = parseRelease(rel())!.files;
  const names = (p: Parameters<typeof pickPrimary>[1]) => pickPrimary(files, p).map((x) => x.file.name);
  assert.deepEqual(names({ os: "windows", arch: "x64", mobile: false }), ["Keplar-1.2.3-win-x64.exe"]);
  assert.deepEqual(names({ os: "windows", arch: null, mobile: false }), ["Keplar-1.2.3-win-x64.exe"]);
  assert.deepEqual(names({ os: "macos", arch: "arm64", mobile: false }), ["Keplar-1.2.3-mac-arm64.dmg"]);
  assert.deepEqual(names({ os: "macos", arch: null, mobile: false }), ["Keplar-1.2.3-mac-arm64.dmg", "Keplar-1.2.3-mac-x64.dmg"]); // unknown chip: both
  assert.deepEqual(names({ os: "linux", arch: "x64", mobile: false }), ["Keplar-1.2.3-linux-x64.AppImage"]);
  // no windows arm64 build: falls back to x64 and says it is not an exact match
  const fb = pickPrimary(files, { os: "windows", arch: "arm64", mobile: false });
  assert.equal(fb[0].file.arch, "x64");
  assert.equal(fb[0].exact, false);
  // no mac files at all, or an unsupported device: nothing offered
  assert.deepEqual(pickPrimary(files.filter((f) => f.os !== "macos"), { os: "macos", arch: "arm64", mobile: false }), []);
  assert.deepEqual(pickPrimary(files, { os: "ios", arch: null, mobile: true }), []);
  assert.deepEqual(pickPrimary([], { os: "windows", arch: "x64", mobile: false }), []);
  const uni = parseRelease(rel({ assets: [asset("Keplar-1.2.3-mac-universal.dmg")] }))!.files;
  assert.deepEqual(pickPrimary(uni, { os: "macos", arch: null, mobile: false }).map((x) => x.file.name), ["Keplar-1.2.3-mac-universal.dmg"]);
  assert.equal(formatSize(1_500_000), "1.4 MB");
  assert.equal(formatSize(0), "");
});

test("structured data: no release means no version or download URLs; a release lists only real files", () => {
  const none = JSON.stringify(downloadPageGraph({ status: "none" }));
  assert.ok(!/downloadUrl|softwareVersion|datePublished/.test(none));
  const ok = parseRelease(rel(), new Map())!;
  const g = JSON.stringify(downloadPageGraph({ status: "ok", release: ok }));
  assert.match(g, /softwareVersion":"1\.2\.3"/);
  assert.ok(ok.files.every((f) => g.includes(f.url)));
});

const TOKEN = "releases-test-token";
async function withToken<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.GITHUB_RELEASES_TOKEN;
  process.env.GITHUB_RELEASES_TOKEN = TOKEN;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.GITHUB_RELEASES_TOKEN;
    else process.env.GITHUB_RELEASES_TOKEN = prev;
  }
}

test("fetch: a token serves a private repo through the download route, and the token never reaches the page", async () => {
  const sumsApi = "https://api.github.com/repos/keplarone/keplar-desktop/releases/assets/99";
  const sums = `${H("a")}  Keplar-1.2.3-win-x64.exe\n`;
  const base = rel();
  const raw = { ...base, assets: base.assets.map((a) => (a.name === "SHA256SUMS" ? { ...a, url: sumsApi } : a)) };
  const seen: { url: string; auth: string | null }[] = [];
  const fetcher = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    seen.push({ url, auth: new Headers(init?.headers).get("authorization") });
    if (url === `https://github.com/${DESKTOP_REPO}/releases`) return new Response("Not Found", { status: 404 });
    if (url === sumsApi) return new Response(sums);
    return json([raw]);
  }) as typeof fetch;
  const got = await withToken(() => getDesktopRelease(fetcher));
  assert.equal(got.status, "ok");
  if (got.status !== "ok") return;
  assert.equal(got.releasesPublic, false);
  assert.equal(got.release.notesUrl, "");
  assert.ok(got.release.files.length >= 1);
  for (const f of got.release.files) {
    assert.equal(f.url, desktopDownloadHref("one", "v1.2.3", f.name));
    assert.equal(f.url.includes(TOKEN), false);
    assert.equal(f.url.startsWith("/api/desktop/download?"), true);
  }
  assert.equal(got.release.checksumsUrl, desktopDownloadHref("one", "v1.2.3", "SHA256SUMS"));
  assert.equal(got.release.files.find((f) => f.name.endsWith("win-x64.exe"))?.sha256, H("a"));
  assert.equal(JSON.stringify(got).includes(TOKEN), false);
  const apiCall = seen.find((s) => s.url.includes("api.github.com/repos/"));
  const pageCall = seen.find((s) => s.url === `https://github.com/${DESKTOP_REPO}/releases`);
  assert.equal(apiCall?.auth, `Bearer ${TOKEN}`);
  assert.equal(pageCall?.auth, null);
});

test("download route: a mocked private asset redirects to GitHub's asset host, and refuses anything else", async () => {
  const api = `https://api.github.com/repos/${DESKTOP_REPO}/releases/assets/7`;
  const release = { tag_name: "v1.2.3", draft: false, prerelease: false, assets: [{ name: "Keplar-1.2.3-win-x64.exe", state: "uploaded", url: api }] };
  const asset = (location: string, status = 302) => fakeFetch((u) => (u === api ? new Response(null, { status, headers: { location } }) : json(release)));
  assert.equal((await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", fakeFetch(() => json(release)))).status, 404);
  await withToken(async () => {
    assert.equal((await openDesktopAsset("one", "v1.2.3", "../secret", fakeFetch(() => { throw new Error("no fetch"); }))).status, 404);
    assert.equal((await openDesktopAsset("one", "nightly", "Keplar-1.2.3-win-x64.exe", fakeFetch(() => { throw new Error("no fetch"); }))).status, 404);
    assert.equal((await openDesktopAsset("one", "v1.2.3", "latest.yml", fakeFetch(() => { throw new Error("no fetch"); }))).status, 404);
    const good = await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", asset("https://release-assets.githubusercontent.com/github-production-release-asset/7?jwt=short"));
    assert.equal(good.status, 302);
    assert.equal(good.headers.get("location"), "https://release-assets.githubusercontent.com/github-production-release-asset/7?jwt=short");
    assert.equal(good.headers.get("location")!.includes(TOKEN), false);
    assert.equal((await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", asset("https://evil.example/file"))).status, 404);
    assert.equal((await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", asset(`https://release-assets.githubusercontent.com/x?token=${TOKEN}`))).status, 404);
    assert.equal((await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", asset("http://release-assets.githubusercontent.com/file"))).status, 404);
    const draft = { ...release, draft: true };
    assert.equal((await openDesktopAsset("one", "v1.2.3", "Keplar-1.2.3-win-x64.exe", fakeFetch(() => json(draft)))).status, 404);
  });
  assert.equal(safeReleaseAssetLocation("https://objects.githubusercontent.com/a/b", DESKTOP_REPO), "https://objects.githubusercontent.com/a/b");
  assert.equal(safeReleaseAssetLocation("https://github.com/other/repo/releases/download/v1/x", DESKTOP_REPO), null);
  assert.equal(await releasesPageVisibility(fakeFetch(() => new Response("nope", { status: 404 }))), "private");
  assert.equal(await releasesPageVisibility(fakeFetch(() => new Response("ok", { status: 200 }))), "public");
  assert.equal(await releasesPageVisibility((async () => { throw new Error("offline"); }) as typeof fetch), "unknown");
});

test("site: Download is in the nav, footer and sitemap", () => {
  assert.ok(primaryNav.some((l) => l.href === "/download"));
  assert.ok(footerNav.some((g) => g.links.some((l) => l.href === "/download")));
  assert.ok(sitemap().some((e) => new URL(e.url).pathname === "/download"));
});

/* ── real v0.1.0–v0.1.2 asset lists (captured from the live Releases API on 2026-10-03; names and sizes only) ── */
type Fx = Record<string, { published_at: string; assets: [string, number][] }>;
const fx = JSON.parse(readFileSync(new URL("./fixtures/desktop-releases.json", import.meta.url), "utf8")) as Fx;
const ghRelease = (tag: string) => ({
  tag_name: tag, name: tag, draft: false, prerelease: false, published_at: fx[tag].published_at,
  html_url: `https://github.com/${DESKTOP_REPO}/releases/tag/${tag}`,
  assets: fx[tag].assets.map(([name, size]) => ({ name, size, state: "uploaded", browser_download_url: `https://github.com/${DESKTOP_REPO}/releases/download/${tag}/${name}` })),
});

test("asset names: the renamed Keplar-One-* scheme parses, and the old Keplar-* scheme still does", () => {
  assert.deepEqual(parseAssetName("Keplar-One-0.1.2-win-x64.exe"), { version: "0.1.2", os: "windows", arch: "x64", type: "exe" });
  assert.deepEqual(parseAssetName("Keplar-One-0.1.2-mac-arm64.dmg"), { version: "0.1.2", os: "macos", arch: "arm64", type: "dmg" });
  assert.deepEqual(parseAssetName("Keplar-One-0.1.2-linux-x86_64.AppImage"), { version: "0.1.2", os: "linux", arch: "x64", type: "AppImage" });
  assert.deepEqual(parseAssetName("Keplar-One-0.1.2-linux-amd64.deb"), { version: "0.1.2", os: "linux", arch: "x64", type: "deb" });
  assert.equal(parseAssetName("Keplar-0.1.1-win-x64.exe")?.version, "0.1.1");
  for (const bad of ["Keplar-One-0.1.2-mac-arm64.dmg.blockmap", "Keplar-One-0.1.2-win-x64.exe.blockmap", "latest.yml", "latest-mac.yml", "latest-linux.yml", "SHA256SUMS", "Keplar-Two-0.1.2-win-x64.exe", "Keplar-One-Pro-0.1.2-win-x64.exe", "Keplar-One--0.1.2-win-x64.exe"]) assert.equal(parseAssetName(bad), null, bad);
});

test("v0.1.2 (real asset list): lists exactly the eight installable files, ignores blockmaps/yml/SHA256SUMS, picks the newest release", async () => {
  const r = parseRelease(ghRelease("v0.1.2"), new Map())!;
  assert.equal(r.version, "0.1.2");
  assert.deepEqual(r.files.map((f) => f.name).sort(), [
    "Keplar-One-0.1.2-linux-amd64.deb", "Keplar-One-0.1.2-linux-x86_64.AppImage", "Keplar-One-0.1.2-linux-x86_64.rpm",
    "Keplar-One-0.1.2-mac-arm64.dmg", "Keplar-One-0.1.2-mac-arm64.zip", "Keplar-One-0.1.2-mac-x64.dmg", "Keplar-One-0.1.2-mac-x64.zip",
    "Keplar-One-0.1.2-win-x64.exe",
  ]);
  assert.ok(r.files.every((f) => f.url.startsWith(`https://github.com/${DESKTOP_REPO}/releases/download/v0.1.2/`) && f.size > 1_000_000));
  assert.equal(r.checksumsUrl, `https://github.com/${DESKTOP_REPO}/releases/download/v0.1.2/SHA256SUMS`);
  // the live list has v0.1.2, v0.1.1 and v0.1.0 (in any order): v0.1.2 wins and its checksums attach by exact name
  const sums = ["Keplar-One-0.1.2-win-x64.exe", "Keplar-One-0.1.2-mac-arm64.dmg"].map((n, i) => `${H(String(i + 1))}  ${n}`).join("\n");
  const got = await getDesktopRelease(fakeFetch((u) => (u.endsWith("SHA256SUMS") ? new Response(sums) : json([ghRelease("v0.1.0"), ghRelease("v0.1.2"), ghRelease("v0.1.1")]))));
  assert.equal(got.status, "ok");
  if (got.status !== "ok") return;
  assert.equal(got.release.tag, "v0.1.2");
  assert.equal(got.release.files.find((f) => f.name.endsWith("win-x64.exe"))?.sha256, H("1"));
  assert.equal(got.release.files.find((f) => f.name.endsWith("linux-amd64.deb"))?.sha256, null);
  // the older, differently named releases still parse (they would be shown if they were the newest)
  assert.equal(parseRelease(ghRelease("v0.1.1"))!.files.length, 8);
  // primary downloads for the real files
  const f = got.release.files;
  const one = (os: "windows" | "macos" | "linux", arch: "x64" | "arm64" | null) => pickPrimary(f, { os, arch, mobile: false }).map((x) => x.file.name);
  assert.deepEqual(one("windows", "x64"), ["Keplar-One-0.1.2-win-x64.exe"]);
  assert.deepEqual(one("macos", "arm64"), ["Keplar-One-0.1.2-mac-arm64.dmg"]);
  assert.deepEqual(one("macos", null), ["Keplar-One-0.1.2-mac-arm64.dmg", "Keplar-One-0.1.2-mac-x64.dmg"]);
  assert.deepEqual(one("linux", "x64"), ["Keplar-One-0.1.2-linux-x86_64.AppImage"]);
  assert.equal(pickPrimary(f, { os: "windows", arch: "arm64", mobile: false })[0].exact, false); // no Windows ARM build: flagged, not hidden
  assert.deepEqual(one("linux", "arm64").length, 1); // x64 AppImage offered, flagged inexact
  assert.equal(pickPrimary(f, { os: "linux", arch: "arm64", mobile: false })[0].exact, false);
});
