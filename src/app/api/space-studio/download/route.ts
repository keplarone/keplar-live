import { assetUrl, isPlatform, latestRelease, platformFromRequest, RELEASES_URL } from "@/lib/space-studio/download";

export const runtime = "nodejs";

/**
 * GET /api/space-studio/download?os=windows|mac-arm|mac-intel|linux|deb -> 302 to that installer in the latest release.
 * Without `os` the platform is guessed from the request. Public. If GitHub can't be reached, falls back to the releases page.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("os");
  const platform = isPlatform(q) ? q : platformFromRequest(req.headers.get("user-agent"), req.headers.get("sec-ch-ua-arch"));
  const release = await latestRelease();
  const url = (release && assetUrl(release, platform)) || RELEASES_URL;
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "public, max-age=60", vary: "user-agent, sec-ch-ua-arch" } });
}
