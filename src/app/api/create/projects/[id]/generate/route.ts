/**
 * Generate or iterate a project. Streams NDJSON events:
 * {type:"status"|"file"|"message"|"done"|"error", ...}
 */
import { createReady } from "@/lib/create/platform/config";
import { generate } from "@/lib/create/codegen";
import { assertCanSpend, charge, estimateUnits } from "@/lib/create/platform/compute";
import { errorResponse, HttpError, body, publicErrorText } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { moderateText } from "@/lib/create/platform/moderation";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { draftPrefix, readFiles, writeDraft } from "@/lib/create/projects";
import { projects } from "@/lib/create/repo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let ws, project, prompt: string;
  try {
    ws = (await currentWorkspace(req));
    if (!createReady()) throw new HttpError(503, "Create isn't set up yet.", "not_configured");
    await rateLimit(`${ws.id}:gen`, ws.entitlements.rpm);
    const { id } = await params;
    project = await projects().get(ws.id, id);
    if (!project) throw new HttpError(404, "Project not found.", "not_found");
    if (ws.plan === "free") throw new HttpError(403, "This generator isn't available on Free. Create's site builder stays on free models.", "plan");
    prompt = ((await body<{ prompt?: string }>(req)).prompt ?? "").trim().slice(0, 4000);
    if (prompt.length < 3) throw new HttpError(400, "Describe what you want to build.");
    const verdict = await moderateText(prompt);
    if (!verdict.allowed) throw new HttpError(422, verdict.reason ?? "Not allowed.", "moderation");
    const action = project.draftVersion ? "site.iterate" : "site.generate";
    await assertCanSpend(ws, estimateUnits(action) + estimateUnits("sandbox.preview"));
  } catch (e) {
    return errorResponse(e);
  }

  const enc = new TextEncoder();
  const p = project;
  const w = ws;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const userMsg = { id: newId("msg"), role: "user" as const, text: prompt, at: now() };
        const prevFiles = p.draftVersion ? await readFiles(draftPrefix(p, p.draftVersion)) : null;
        const it = generate(prompt, { projectId: p.id, prevSpec: p.spec, prevFiles });
        let r = await it.next();
        while (!r.done) {
          send(r.value);
          r = await it.next();
        }
        const result = r.value;
        const version = await writeDraft(p, result.files);
        const action = p.draftVersion ? "site.iterate" : "site.generate";
        const units = (await charge(w, action, { usd: result.usd, ref: p.id })) + (await charge(w, "sandbox.preview", { ref: p.id }));
        const assistant = { id: newId("msg"), role: "assistant" as const, text: result.summary, at: now(), units };
        await projects().update(w.id, p.id, {
          spec: result.spec ?? p.spec,
          draftVersion: version,
          files: Object.keys(result.files),
          messages: [...p.messages, userMsg, assistant],
          updatedAt: now(),
        });
        send({ type: "message", text: result.summary });
        send({ type: "done", version, units, preview: `/sites/preview/${p.id}/?v=${version}` });
      } catch (err) {
        send({ type: "error", error: publicErrorText(err, "Generation failed. Try again in a moment.") });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
