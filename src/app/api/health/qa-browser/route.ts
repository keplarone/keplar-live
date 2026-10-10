import { json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cached: { at: number; body: Record<string, unknown> } | null = null;

/** Can this deployment start the headless browser that tests generated sites? Opens a data: page, reads its title, closes. Cached for 5 minutes; reveals only yes/no, a version and the time it took. */
export async function GET() {
  if (cached && Date.now() - cached.at < 300_000) return json(cached.body, { headers: { "cache-control": "no-store" } });
  const t = Date.now();
  let body: Record<string, unknown>;
  try {
    const { launchBrowser } = await import("@/lib/site-builder/qa/browser");
    const b = await launchBrowser();
    try {
      const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
      const page = await ctx.newPage();
      await page.goto("data:text/html,<title>ok</title><h1>hello</h1>");
      const title = await page.title();
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      await ctx.close();
      body = { available: title === "ok" && shot.length > 200, browser: b.version(), ms: Date.now() - t };
    } finally {
      await b.close().catch(() => undefined);
    }
  } catch (e) {
    body = { available: false, error: e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : "unknown", ms: Date.now() - t };
  }
  cached = { at: Date.now(), body };
  return json(body, { headers: { "cache-control": "no-store" } });
}
