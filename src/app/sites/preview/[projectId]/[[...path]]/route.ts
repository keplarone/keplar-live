import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse } from "@/lib/create/platform/http";
import { servePreview } from "@/lib/create/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Draft preview (production: a Vercel Sandbox URL on the user-content domain).
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string; path?: string[] }> }) {
  try {
    const { projectId, path } = await params;
    return await servePreview((await currentWorkspace(req)).id, projectId, path);
  } catch (e) {
    return errorResponse(e); // signed out is a 401, not a 500 that lands in the error log
  }
}
