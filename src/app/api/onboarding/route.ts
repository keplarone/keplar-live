/**
 * First-run onboarding state for the signed-in user.
 *   GET   -> { state, plan, name, starters, checklist, firstQuestionDone }
 *   PATCH -> { step?, answers? }  save progress (refresh resumes), merge answers
 *   POST  -> { action: "complete" | "skip" | "replay" | "progress", answers?, key? }
 * Signed out is 401. Same-origin only for writes. Nothing here can block /app: every failure is a plain error the client ignores.
 */
import { getSession } from "@/lib/accounts/auth";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { minuteLimit } from "@/lib/tools/access";
import { isSameOrigin } from "@/lib/security/origin";
import { getOnboarding } from "@/lib/onboarding/store";
import { applyMutation, payloadFor, type Mutation } from "@/lib/onboarding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context(req: Request, write: boolean) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req);
  if (!ws.userId) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  await minuteLimit(`onboarding:${ws.id}:${write ? "w" : "r"}`, write ? 60 : 120);
  const accountName = ((await getSession(req.headers))?.user.name ?? "").trim();
  return { ws, userId: ws.userId, accountName };
}

export async function GET(req: Request) {
  try {
    const { ws, userId, accountName } = await context(req, false);
    return json(await payloadFor(ws, await getOnboarding(userId), accountName));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Origin and sign-in are checked before the body is even read; a bad request never reaches the store. */
async function mutate(req: Request, shape: (b: Mutation) => void) {
  const { ws, userId, accountName } = await context(req, true);
  const b = await body<Mutation>(req);
  shape(b);
  const state = await applyMutation(userId, b);
  return json(await payloadFor(ws, state, state.answers.name || accountName));
}

export async function PATCH(req: Request) {
  try {
    return await mutate(req, (b) => { if (b.action !== undefined) throw new HttpError(400, "Use POST for actions.", "invalid"); });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    return await mutate(req, (b) => { if (b.action === undefined) throw new HttpError(400, "Send an action.", "invalid"); });
  } catch (e) {
    return errorResponse(e);
  }
}
