import { body, errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { estimateFor, type ImageInput } from "@/lib/images/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Credit estimate shown before a job runs. Reads only; nothing is reserved or charged. */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const input = await body<ImageInput>(req);
    const { estimate, usage } = await estimateFor(ws, { size: input.size, quality: input.quality, references: input.references, model: input.model, seed: input.seed, negativePrompt: input.negativePrompt, referenceCount: input.referenceCount, regenerateOf: typeof input.regenerateOf === "string" ? input.regenerateOf : undefined });
    return json({ estimate: { units: estimate.units, quality: estimate.quality, size: estimate.size }, usage });
  } catch (e) {
    return errorResponse(e);
  }
}
