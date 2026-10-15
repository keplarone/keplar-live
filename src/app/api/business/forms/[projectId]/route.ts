import { projects } from "@/lib/create/repo";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { HttpError, readFormData } from "@/lib/create/platform/http";
import { recordFormSubmission } from "@/lib/business/crm";
import { isPublished, safeReturnPath } from "@/lib/business/commerce";
import { emit } from "@/lib/business/events";
import { clientIp, htmlPage, seeOther, withParam, esc } from "../../_html";

export const runtime = "nodejs";
/** Queued background jobs (platform/queue.ts) started or resumed here run after the response, within this limit. */
export const maxDuration = 120;

/** Public endpoint for contact forms on generated sites → CRM + inbox (+ lead follow-up agent). */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const project = await projects().findSystem((p) => p.id === projectId);
  if (!project || project.takenDown) return htmlPage(404, "Not found", "<h1>This form isn't available.</h1>");
  // Only a published site's form takes submissions (AZ-7): a draft or unpublished project is not open to the public.
  if (!isPublished(project)) return htmlPage(404, "Not found", "<h1>This form isn't available yet.</h1><p>It starts working once the site is published.</p>");
  const form = await readFormData(req, 64_000).catch(() => null);
  if (!form) return htmlPage(400, "Bad request", "<h1>Something went wrong.</h1>");
  const ret = safeReturnPath(form.get("_return"), `/sites/${project.slug}/`);
  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (String(form.get("_hp") ?? "")) return seeOther(withParam(ret, "sent", "1"));
  try {
    await rateLimit(`form:${projectId}:${clientIp(req)}`, 5);
    const contact = await recordFormSubmission(project.workspaceId, project.id, project.name, {
      name: String(form.get("name") ?? "").slice(0, 120),
      email: String(form.get("email") ?? ""),
      message: String(form.get("message") ?? ""),
    });
    await emit(project.workspaceId, "form.submitted", { contactId: contact.id, projectId });
    return seeOther(withParam(ret, "sent", "1"));
  } catch (err) {
    const msg = err instanceof HttpError || err instanceof RateLimitError ? err.message : "Something went wrong.";
    return htmlPage(err instanceof RateLimitError ? 429 : 400, "Couldn't send", `<h1>Couldn't send your message</h1><p>${esc(msg)}</p><p><a href="${esc(ret)}">Go back</a></p>`);
  }
}
