/**
 * Study sets (every plan; signed-in). Free runs on free models only with smaller caps; Plus/Pro get stronger models and bigger limits.
 *   GET  -> your sets
 *   POST -> multipart { file?: PDF/.txt/.md, text?: pasted, title?, examDate? }: validates bytes, extracts text on the server, builds the set
 * Charged (Plus/Pro) from the cost the providers report; Free never is; a run with no usable reply is never charged.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { dailyLimit, minuteLimit, studyWorkspace } from "@/lib/tools/access";
import { studyLimitsFor } from "@/lib/tools/limits";
import { clean } from "@/lib/tools/json";
import { deadline, preflight, requireDeps, ToolModelError, ToolRun } from "@/lib/tools/run";
import { estimateCallUsd, tokensOf, type ToolPlan } from "@/lib/tools/models";
import { DocError, readPasted, readUpload, type Extracted } from "@/lib/documents/ingest";
import { buildSet, estimateBuildChars } from "@/lib/study/engine";
import { guides, sets } from "@/lib/study/repo";
import { validExamDate } from "@/lib/study/dates";
import type { StudySet } from "@/lib/study/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: Request) {
  try {
    const ws = await studyWorkspace(req);
    const rows = (await sets().list(ws.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json({ sets: rows.map((s) => ({ id: s.id, title: s.title, pages: s.source.pages, topics: s.topics.length, cards: s.cards.length, questions: s.questions.length, examDate: s.examDate, updatedAt: s.updatedAt })), limits: studyLimitsFor(ws.plan), plan: ws.plan });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  let run: ToolRun | null = null;
  let wsRef: Awaited<ReturnType<typeof studyWorkspace>> | null = null;
  try {
    const ws = await studyWorkspace(req);
    wsRef = ws;
    const L = studyLimitsFor(ws.plan);
    if (Number(req.headers.get("content-length") ?? 0) > L.maxUploadBytes + 200_000) throw new HttpError(413, `That upload is too large. Your plan accepts files up to ${Math.round(L.maxUploadBytes / 1048576)} MB.`, "too_large");
    await minuteLimit(`study:${ws.id}:min`, 6);
    await dailyLimit(`study:${ws.id}:build`, L.buildsPerDay, "building study sets");
    if ((await sets().list(ws.id)).length >= L.maxSets) throw new HttpError(409, `You've saved ${L.maxSets} study sets on your plan. Delete one to make room.`, "limit");
    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, "Send the guide as a file or as text.", "bad_request");
    const file = form.get("file");
    const pasted = typeof form.get("text") === "string" ? (form.get("text") as string) : "";
    let doc: Extracted;
    let fileName: string | undefined;
    if (file instanceof File && file.size > 0) {
      await dailyLimit(`study:${ws.id}:upload`, L.uploadsPerDay, "uploads");
      fileName = file.name.slice(0, 120);
      doc = await readUpload({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type }, { maxBytes: L.maxUploadBytes, maxPages: L.maxPages, maxChars: L.maxChars });
    } else if (pasted.trim()) {
      doc = readPasted(pasted, { maxChars: L.maxChars });
    } else throw new DocError("no_file", "Upload a PDF or paste your study guide text.", 400);

    const est = estimateCallUsd(ws.plan as ToolPlan, tokensOf(estimateBuildChars(doc.chars, L)) + 800, 3500) + estimateCallUsd(ws.plan as ToolPlan, tokensOf(Math.min(doc.chars, L.inputBudgetChars)) + 800, 2500) * Math.ceil(L.topics / 5);
    await preflight(ws, est);
    const deps = requireDeps(ws.plan as ToolPlan);
    run = new ToolRun(ws, deps, deadline(req, 160_000));
    const built = await buildSet(run, { pages: doc.pages, limits: L });
    const credits = await run.settle(ws, "study.build");
    const t = now();
    const set: StudySet = {
      id: newId("set"), workspaceId: ws.id,
      title: clean(form.get("title"), 120) || built.title || fileName?.replace(/\.[a-z0-9]+$/i, "") || "Study guide",
      source: { kind: doc.kind, fileName, pages: doc.numPages, chars: doc.chars, truncated: doc.truncated },
      summary: built.summary, topics: built.topics, cards: built.cards, questions: built.questions,
      examDate: validExamDate(form.get("examDate")), coverage: built.coverage, model: run.model ?? undefined, credits, createdAt: t, updatedAt: t,
    };
    await sets().insert(set);
    await guides().insert({ id: set.id, workspaceId: ws.id, pages: doc.pages });
    return json({ id: set.id, credits, truncated: doc.truncated, coverage: built.coverage });
  } catch (e) {
    if (run && wsRef) await run.settle(wsRef, "study.build").catch(() => undefined);
    if (e instanceof DocError) return json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof ToolModelError) return json({ error: e.busy ? "The models are busy right now. You were not charged. Try again in a minute." : e.message, code: "model_error" }, { status: 502 });
    return errorResponse(e);
  }
}
