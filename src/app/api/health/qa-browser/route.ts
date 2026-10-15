import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { opsAuthorized } from "@/lib/ops/openrouter-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cached: { at: number; body: Record<string, unknown> } | null = null;
let running: Promise<Record<string, unknown>> | null = null;

/**
 * Can this deployment start the headless browser that tests generated sites? Opens a data: page, reads its title, closes.
 * Admins and monitoring only (Authorization: Bearer OPS_CHECK_SECRET or CRON_SECRET; anyone else gets 404): starting Chromium
 * is expensive, so a public URL would let anyone make every instance launch it. Cached for 5 minutes, one launch at a time.
 */
export async function GET(req: Request) {
  try {
    if (!opsAuthorized(req.headers.get("authorization"))) await requireAdmin(req);
  } catch (e) {
    return errorResponse(e);
  }
  if (cached && Date.now() - cached.at < 300_000) return json(cached.body, { headers: { "cache-control": "no-store" } });
  running ??= probe().finally(() => { running = null; });
  return json(await running, { headers: { "cache-control": "no-store" } });
}

async function probe(): Promise<Record<string, unknown>> {
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
  return body;
}
