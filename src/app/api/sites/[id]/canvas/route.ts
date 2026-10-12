import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { CANVAS_ELEMENT_MAX, CANVAS_INSTRUCTION_MAX, canvasEdit } from "@/lib/site-builder/canvas";
import { checkPrompt } from "@/lib/site-builder/safety";
import { getSite, saveFilesEdit, toSummary } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** The AI Design Canvas is a Keplar Business feature; Keplar One keeps Create's own editor. */
function assertBusiness(ws: Workspace) {
  if (ws.plan !== "business") throw new EntitlementError("The AI Design Canvas comes with Keplar Business.", "business");
}

/**
 * POST /api/sites/:id/canvas  { element, instruction, classes }  → { html, note }
 * AI mode: a proposed replacement for one selected element. Nothing is saved; the owner approves the draft with PUT.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await currentWorkspace(req, { team: true });
    assertBusiness(ws);
    await rateLimit(`sb:canvas:${ws.id}`, 12, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");
    const input = await body<{ element?: unknown; instruction?: unknown; classes?: unknown }>(req);
    const element = typeof input.element === "string" ? input.element.trim() : "";
    const instruction = typeof input.instruction === "string" ? input.instruction.replace(/\s+/g, " ").trim() : "";
    if (!element) throw new HttpError(400, "Select an element on the canvas first.");
    if (element.length > CANVAS_ELEMENT_MAX) throw new HttpError(400, "That element is too large for one AI edit. Select a smaller part of the page.");
    if (instruction.length < 3) throw new HttpError(400, "Describe the change you want.");
    if (instruction.length > CANVAS_INSTRUCTION_MAX) throw new HttpError(400, `Keep the instruction under ${CANVAS_INSTRUCTION_MAX} characters.`);
    const classes = Array.isArray(input.classes) ? input.classes.filter((c): c is string => typeof c === "string" && /^[\w-]{1,60}$/.test(c)).slice(0, 80) : [];
    const problem = await checkPrompt(instruction);
    if (problem) throw new HttpError(422, problem, "refused");
    if (!process.env.OPENROUTER_API_KEY?.trim()) throw new HttpError(503, "AI editing isn't connected to a model right now. Design and Code modes still work.", "unavailable");
    await assertCanSpend(ws, 2);
    const out = await canvasEdit(ws.plan, { element, instruction, classes });
    if (!out) throw new HttpError(502, "The model didn't return a usable edit this time. Nothing changed; try again or rephrase.", "no_result");
    const credits = out.usd > 0 ? await charge(ws, "site.edit", { usd: Math.max(out.usd, 0.0003), ref: `canvas:${site.id}` }).catch(() => 0) : 0;
    return json({ html: out.html, note: out.note, credits });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * PUT /api/sites/:id/canvas  { files: { "index.html": "..." }, baseVersion, note }  → { site, version }
 * "Approve and save": the canvas draft becomes a new version after the same file checks as any edit (undo in History).
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await currentWorkspace(req, { team: true });
    assertBusiness(ws);
    await rateLimit(`sb:edit:${ws.id}`, 30, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");
    const input = await body<{ files?: unknown; baseVersion?: unknown; note?: unknown }>(req);
    if (!input.files || typeof input.files !== "object" || Array.isArray(input.files)) throw new HttpError(400, "Send the changed files.");
    const files = Object.fromEntries(Object.entries(input.files as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    if (Object.keys(files).length > 40) throw new HttpError(400, "Too many files in one save.");
    const baseVersion = Number(input.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 1) throw new HttpError(400, "Which version did these edits start from?");
    const { site: saved, version } = await saveFilesEdit(ws, site, files, { baseVersion, note: typeof input.note === "string" ? input.note : "" });
    return json({ site: toSummary(saved, new URL(req.url).origin), version: version.n });
  } catch (e) {
    return errorResponse(e);
  }
}
