import { body, errorResponse, HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { mobileProject, normalizeSpec, SpecError, type MobileSpec } from "@/lib/mobile/scaffold";
import { makeZip } from "@/lib/site-builder/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the generated Expo project as a ZIP (BETA). Deterministic: no model call, nothing charged. */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`mobile:project:${ws.id}`, 10, 60, { shared: true });
    const spec = await body<Partial<MobileSpec>>(req);
    let files: Record<string, string>;
    try {
      files = mobileProject(spec);
    } catch (e) {
      if (e instanceof SpecError) throw new HttpError(400, e.message);
      throw e;
    }
    const zip = makeZip(files);
    const slug = normalizeSpec(spec).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
    return new Response(new Uint8Array(zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${slug}-expo.zip"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
