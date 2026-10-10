/**
 * Builds survive a reload. While a build runs the studio keeps {appId, buildId, prompt} in localStorage; when the page comes
 * back it asks the server where that build is and either follows it to the end, shows the finished app, or shows the error
 * with a retry. Pure helpers (storage is injected) so the decisions are unit-tested.
 */
export const RESUME_KEY = "keplar:app-build";
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type ResumeRecord = { appId: string; buildId: string | null; prompt: string; edit: boolean; at: number };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const store = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function saveResume(r: ResumeRecord, s: Store | null = store()) {
  try {
    s?.setItem(RESUME_KEY, JSON.stringify(r));
  } catch {
    /* storage full or blocked: a reload just won't resume */
  }
}

export function loadResume(now = Date.now(), s: Store | null = store()): ResumeRecord | null {
  try {
    const raw = s?.getItem(RESUME_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ResumeRecord>;
    if (!v || typeof v.appId !== "string" || !v.appId || typeof v.at !== "number") return null;
    if (now - v.at > RESUME_MAX_AGE_MS) {
      s?.removeItem(RESUME_KEY);
      return null;
    }
    return { appId: v.appId, buildId: typeof v.buildId === "string" ? v.buildId : null, prompt: String(v.prompt ?? ""), edit: Boolean(v.edit), at: v.at };
  } catch {
    return null;
  }
}

export function clearResume(s: Store | null = store()) {
  try {
    s?.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}

export type ServerBuild = { id: string; stage: string; error?: string | null } | null;
export type ResumeAction = { kind: "follow"; buildId: string } | { kind: "failed"; error: string } | { kind: "open" } | { kind: "none" };

/**
 * What to do with a saved record given the app's latest unfinished build from GET /api/apps/:id (null when the newest build
 * is done). A build that never got its id (the page closed during the first request) cannot be followed: say so.
 */
export function resumeAction(rec: ResumeRecord | null, server: ServerBuild): ResumeAction {
  if (!rec) return server && server.stage !== "failed" ? { kind: "follow", buildId: server.id } : { kind: "none" };
  if (server && server.stage === "failed" && (!rec.buildId || rec.buildId === server.id)) return { kind: "failed", error: server.error || "The build stopped with an error." };
  if (server && server.stage !== "failed" && server.stage !== "done") return { kind: "follow", buildId: server.id };
  if (!server && rec.buildId) return { kind: "open" };
  if (!server && !rec.buildId) return { kind: "failed", error: "The page closed before the build began. Nothing was charged; start it again." };
  return { kind: "open" };
}

/** True for the error the server gives when this workspace's build slot is still held by the request that was running before the reload. */
export const isBusyError = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === "too_many_jobs" || /already has a build running|already have a build running/i.test(e.message ?? "")));
