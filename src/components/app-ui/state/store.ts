import { applyCore } from "./core";
import type { KeplarEvent } from "@/lib/orchestration/types";
import type { AccountInfo, AppState, ChatImage, KeplarMessage, Ledger, Message, Project, Settings, StudioTurn, AgentFlow, ChatCreate, WorkspaceCard, ErrandCard, Thread, UserMessage, View } from "./types";

import { topicTitle } from "@/lib/chat-title";
import { readSaved, storageKey, writeSaved, type Scope } from "./scope";
import { applyDebate } from "./debate";
import { applyResearch } from "./research";

const MAX_THREADS = 200;

export const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const today = () => new Date().toLocaleDateString("en-CA");

const defaultSettings: Settings = { routing: { strategy: "auto", maxModels: 6, tier: "standard", preferOpenWeights: false, excludeProviders: [] } };

/**
 * Starts empty with scope "pending": which account (or the anonymous device) owns the chats is only known once the server
 * answers, and until then nothing from local storage is shown. `loadScope` fills the state for the resolved scope.
 */
export function initialState(): AppState {
  return {
    scope: "pending",
    account: null,
    epoch: 0,
    threads: [],
    projects: [],
    activeThreadId: null,
    view: "thread",
    projectFilter: null,
    ledger: { used: 0, total: null, plan: "free", resetsAt: null, paused: false, signedIn: false, windows: null, synced: false },
    settings: defaultSettings,
  };
}

export type Loaded = Pick<AppState, "threads" | "projects" | "activeThreadId" | "settings">;

/** A picture that was only waiting for a decision (or for the cost) is not started after a reload; one that is working resumes by its job id. */
export const settleImage = (m: Message): Message =>
  m.role === "keplar" && m.image && (m.image.phase === "checking" || m.image.phase === "confirm")
    ? { ...m, image: { ...m.image, phase: "canceled", error: "This picture wasn't started. Nothing was charged." } }
    : m;

/** A study set or deck that was being made when the page went away: the studio may have finished it, so never start it again on its own. */
export const settleStudio = (m: Message): Message =>
  m.role === "keplar" && m.studio?.phase === "working"
    ? { ...m, studio: { ...m.studio, phase: "interrupted" } }
    : m;

/** An agent run that was streaming when the page went away may have finished on the server: say where to look, never re-run it. */
export const settleAgentFlow = (m: Message): Message =>
  m.role === "keplar" && m.agentFlow?.phase === "running" ? { ...m, agentFlow: { ...m.agentFlow, phase: "interrupted" } } : m;

/** An errand that was starting when the page went away may have started on the server: never start it again on its own. */
export const settleErrand = (m: Message): Message =>
  m.role === "keplar" && m.errand?.phase === "starting"
    ? { ...m, errand: { ...m.errand, phase: "failed", error: "The page reloaded while this was starting. Check Keplar Browser before trying again, so it doesn't run twice." } }
    : m;

/** A run can't survive a reload (or a move to another store): mark it so the user can retry. */
export const settle = (t: Thread): Thread => ({
  ...t,
  messages: t.messages.map(settleImage).map(settleStudio).map(settleAgentFlow).map(settleErrand).map((m) =>
    m.role === "keplar" && m.status === "running"
      ? ({ ...m, status: "error", error: { kind: "network", message: "Interrupted before the answer finished.", retryable: true } } as KeplarMessage)
      : m,
  ),
});

/** The chats cached in this browser for exactly one scope (anonymous device, or one account). Nothing else is read. */
export function loadScope(scope: Scope): Loaded {
  const empty: Loaded = { threads: [], projects: [], activeThreadId: null, settings: defaultSettings };
  const key = storageKey(scope);
  const saved = key ? readSaved(key) : null;
  if (!saved) return empty;
  const threads = (Array.isArray(saved.threads) ? saved.threads : []).filter((t) => t && typeof t.id === "string" && Array.isArray(t.messages)).map(settle);
  const s = (saved.settings ?? {}) as Partial<Settings>;
  return {
    threads,
    projects: saved.projects ?? [],
    activeThreadId: saved.activeThreadId && threads.some((t) => t.id === saved.activeThreadId) ? saved.activeThreadId : null,
    settings: { ...defaultSettings, ...s, routing: { ...defaultSettings.routing, ...s.routing } },
  };
}

export function persist(state: AppState) {
  const key = storageKey(state.scope);
  if (!key) return; // pending: nothing is known to belong anywhere yet
  try {
    // Usage is metered server-side; only threads and preferences are stored locally.
    const { threads, projects, activeThreadId, settings } = state;
    // Media (thumbnails, image data, video frames) stays in memory only: keep names and sizes, drop the data.
    // Signed in: the server is the source of truth for chats (they reload from it), so no chat text is cached in this browser.
    // Only this device's anonymous chats are kept locally.
    const stored = (state.scope === "anon" ? threads : []).filter((t) => !t.remote && !t.private).slice(0, MAX_THREADS).map((t) => ({
      ...t,
      messages: t.messages.map((m) => (m.role === "user" && m.media?.length ? { ...m, media: m.media.map((x) => ({ id: x.id, kind: x.kind, name: x.name, bytes: x.bytes, durationSec: x.durationSec, frames: x.frames })) } : m)),
    }));
    writeSaved(key, { threads: stored, projects, activeThreadId, settings });
  } catch {
    /* unavailable: the session still works in memory */
  }
}

/** Allowance and remaining units from the server meter. */
export const allowance = (s: AppState) => s.ledger.total ?? Infinity;
export const remaining = (s: AppState) => Math.max(0, allowance(s) - s.ledger.used);

export type Action =
  | { type: "new-thread"; projectId?: string | null }
  | { type: "open-thread"; id: string }
  | { type: "delete-thread"; id: string }
  | { type: "restore-thread"; thread: Thread; open: boolean }
  | { type: "rename-thread"; id: string; title: string }
  | { type: "set-topic-title"; id: string; title: string; final: boolean }
  | { type: "scope"; scope: Scope; account: AccountInfo | null; loaded?: Loaded }
  | { type: "import"; scope: Scope; threads: Thread[]; projects: Project[] }
  | { type: "merge-remote"; scope: Scope; chats: { id: string; title: string; projectId: string | null; createdAt: number; updatedAt: number; specialistId?: string }[] }
  | { type: "hydrate"; scope: Scope; id: string; messages: Message[]; /** The chat's Specialist saved on the server (null = none). */ specialistId?: string | null }
  | { type: "forget-remote" }
  | { type: "view"; view: View; projectFilter?: string | null }
  | { type: "send"; threadId: string; user: UserMessage; keplar: KeplarMessage; projectId?: string | null }
  | { type: "retry"; threadId: string; keplarId: string; next: KeplarMessage }
  | { type: "event"; threadId: string; keplarId: string; event: KeplarEvent }
  | { type: "fail"; threadId: string; keplarId: string; error: NonNullable<KeplarMessage["error"]> }
  | { type: "stop"; threadId: string; keplarId: string }
  | { type: "add-project"; project: Project }
  | { type: "move-thread"; id: string; projectId: string | null }
  | { type: "merge-projects"; scope: Scope; projects: Project[] }
  | { type: "remove-project"; id: string; chats: "keep" | "delete" }
  | { type: "rename-project"; id: string; name: string }
  | { type: "drop-project-chats"; id: string }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "ledger"; ledger: Omit<Ledger, "synced"> }
  | { type: "upsell"; threadId: string; keplarId: string; reason: "milestone" | "complex" | null }
  | { type: "image"; threadId: string; keplarId: string; patch: Partial<ChatImage> }
  | { type: "studio"; threadId: string; keplarId: string; patch: Partial<StudioTurn> }
  | { type: "agentFlow"; threadId: string; keplarId: string; patch: Partial<AgentFlow> }
  | { type: "create"; threadId: string; keplarId: string; patch: Partial<ChatCreate> }
  | { type: "workspace"; threadId: string; keplarId: string; patch: Partial<WorkspaceCard> }
  | { type: "errand"; threadId: string; keplarId: string; patch: Partial<ErrandCard> }
  | { type: "private-next"; on: boolean }
  | { type: "set-specialist"; id: string | null };

/** Leaving a private chat (opening another or starting a new one) discards it: it was never saved anywhere. */
function leavePrivate(state: AppState, nextActive: string | null): Thread[] {
  const cur = state.activeThreadId;
  if (!cur || cur === nextActive) return state.threads;
  const t = state.threads.find((x) => x.id === cur);
  return t?.private ? state.threads.filter((x) => x.id !== cur) : state.threads;
}


function patchKeplar(state: AppState, threadId: string, keplarId: string, fn: (m: KeplarMessage) => KeplarMessage): AppState {
  return {
    ...state,
    threads: state.threads.map((t) =>
      t.id !== threadId
        ? t
        : { ...t, updatedAt: Date.now(), messages: t.messages.map((m) => (m.role === "keplar" && m.id === keplarId ? fn(m) : m)) },
    ),
  };
}

export function applyEvent(m: KeplarMessage, e: KeplarEvent): KeplarMessage {
  switch (e.type) {
    case "stage": {
      const others = m.stages.filter((s) => s.id !== e.stage);
      const existing = m.stages.find((s) => s.id === e.stage);
      const next = { id: e.stage, status: e.status, detail: e.detail ?? existing?.detail };
      return { ...m, stages: existing ? m.stages.map((s) => (s.id === e.stage ? next : s)) : [...others, next] };
    }
    case "capabilities":
      return { ...m, capabilities: e.items, mode: e.mode, modelCount: e.modelCount };
    case "model":
      return { ...m, models: [...m.models, { id: e.modelId, name: e.name, status: e.status }] };
    case "disagreement":
      return { ...m, disagreement: e.summary };
    case "smalltalk":
      return { ...m, smalltalk: true, mode: "single" };
    case "delta":
      return { ...m, draft: m.draft + e.text };
    case "answer": {
      // The finished answer carries the debate transcript (answer.debate); the live copy is dropped so it isn't stored twice.
      const debate = m.debate?.skipped ? { ...m.debate, turns: [] } : undefined;
      // Likewise the research: the answer carries its summary (answer.research), the live plan view is dropped.
      return { ...m, status: "done", answer: e.answer, draft: "", finishedAt: Date.now(), debate, research: undefined, core: undefined };
    }
    case "research":
      return { ...m, research: applyResearch(m.research, e.research) };
    case "core": {
      // Next steps arrive after the answer: they are kept on the answer itself so they are saved with the chat.
      if (e.core.phase === "insight" && m.answer?.core) return { ...m, answer: { ...m.answer, core: { ...m.answer.core, nextSteps: e.core.nextSteps, ...(e.core.clarify ? { clarify: e.core.clarify } : {}) } } };
      return { ...m, core: applyCore(m.core, e.core) };
    }
    case "debate":
      return { ...m, debate: applyDebate(m.debate, e.debate) };
    case "tool": {
      const tools = m.tools ?? [];
      return { ...m, tools: tools.some((t) => t.id === e.use.id) ? tools.map((t) => (t.id === e.use.id ? e.use : t)) : [...tools, e.use] };
    }
    case "daily":
      return m;
    case "recovery":
      // A real state from the server or the reconnect loop (KeplarApp): shown as one quiet line on the card.
      return { ...m, recovery: e.state === "lost" ? undefined : { state: e.state, headless: Boolean(e.headless) } };
    case "memory":
      return { ...m, memory: { saved: e.saved, ...(e.summarized ? { summarized: true } : {}), ...(e.used ? { used: e.used } : {}) } };
    case "limit":
      return { ...m, status: "limit", limit: { required: e.required, remaining: e.remaining, ...(e.window ? { window: e.window } : {}), ...(e.daily ? { daily: e.daily } : {}), ...(e.budget === "day" ? { budget: "day" as const, ...(e.resetsAt ? { resetsAt: e.resetsAt } : {}) } : {}) }, finishedAt: Date.now() };
    case "error":
      return {
        ...m,
        status: "error",
        error: e.code === "no_response"
          ? { kind: "no_response", message: e.message, retryable: true, upgrade: e.upgrade === true }
          : { kind: e.code === "network" ? "network" : "server", message: e.message, retryable: e.retryable },
        draft: "",
        finishedAt: Date.now(),
      };
  }
}

export function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case "new-thread":
      return { ...state, threads: leavePrivate(state, null), activeThreadId: null, view: "thread", projectFilter: a.projectId ?? null, privateNext: false, specialistNext: null };
    case "open-thread":
      return { ...state, threads: leavePrivate(state, a.id), activeThreadId: a.id, view: "thread" };
    case "private-next":
      return { ...state, privateNext: a.on };
    case "set-specialist": {
      const active = state.activeThreadId ? state.threads.find((t) => t.id === state.activeThreadId) : undefined;
      if (!active) return { ...state, specialistNext: a.id };
      return { ...state, threads: state.threads.map((t) => (t.id === active.id ? { ...t, specialistId: a.id ?? undefined, updatedAt: Date.now() } : t)) }; // the bump saves the choice to the account copy
    }
    case "delete-thread":
      return { ...state, threads: state.threads.filter((t) => t.id !== a.id), activeThreadId: state.activeThreadId === a.id ? null : state.activeThreadId };
    case "restore-thread":
      // Undo of a delete: put the chat back (newest first, like any chat) unless it came back some other way.
      if (state.threads.some((t) => t.id === a.thread.id)) return state;
      return { ...state, threads: [a.thread, ...state.threads].sort((x, y) => y.updatedAt - x.updatedAt), ...(a.open ? { activeThreadId: a.thread.id, view: "thread" as const } : {}) };
    case "rename-thread":
      return { ...state, threads: state.threads.map((t) => (t.id === a.id ? { ...t, title: a.title.slice(0, 120), titleBy: "user" as const } : t)) };
    case "set-topic-title":
      // A topic title never replaces one the person wrote, and does not move the chat in the list.
      return { ...state, threads: state.threads.map((t) => (t.id === a.id && t.titleBy !== "user" ? { ...t, title: a.title.slice(0, 60), titleBy: a.final ? ("topic" as const) : ("auto" as const) } : t)) };
    case "scope": {
      const same = a.account?.id === state.account?.id && a.account?.email === state.account?.email && a.account?.name === state.account?.name;
      if (a.scope === state.scope || !a.loaded) return same ? state : { ...state, account: a.account };
      if (state.scope === "pending") {
        // The first identity answer. Anything started while it was pending (a first question sent before /api/compute came back)
        // belongs to whoever is on screen: it is merged in front of the stored chats and stays open, never overwritten.
        const live = state.threads.filter((t) => t.messages.length > 0);
        const liveIds = new Set(live.map((t) => t.id));
        const keepActive = state.activeThreadId !== null && liveIds.has(state.activeThreadId);
        const projIds = new Set(state.projects.map((p) => p.id));
        return {
          ...state,
          ...a.loaded,
          threads: [...live, ...a.loaded.threads.filter((t) => !liveIds.has(t.id))],
          projects: [...state.projects, ...a.loaded.projects.filter((p) => !projIds.has(p.id))],
          activeThreadId: keepActive ? state.activeThreadId : a.loaded.activeThreadId,
          scope: a.scope,
          account: a.account,
        };
      }
      // A different account (or sign-out): the whole chat state is replaced, nothing of the previous scope is carried over.
      return { ...state, ...a.loaded, scope: a.scope, account: a.account, epoch: state.epoch + 1, view: "thread", projectFilter: null };
    }
    case "import": {
      if (a.scope !== state.scope) return state;
      const have = new Set(state.threads.map((t) => t.id));
      const haveP = new Set(state.projects.map((p) => p.id));
      const added = a.threads.filter((t) => !have.has(t.id));
      return { ...state, threads: [...added, ...state.threads].sort((x, y) => y.updatedAt - x.updatedAt), projects: [...state.projects, ...a.projects.filter((p) => !haveP.has(p.id))] };
    }
    case "merge-remote": {
      if (a.scope !== state.scope) return state; // a late answer for an account that is no longer on screen
      const have = new Set(state.threads.map((t) => t.id));
      const added: Thread[] = a.chats.filter((c) => !have.has(c.id)).map((c) => ({ ...c, messages: [], remote: true }));
      // Titles saved on the server win for chats that exist in both places and were not edited here since.
      const byId = new Map(a.chats.map((c) => [c.id, c]));
      const merged = state.threads.map((t) => { const r = byId.get(t.id); return r && r.updatedAt > t.updatedAt && t.messages.length === 0 ? { ...t, title: r.title, updatedAt: r.updatedAt } : t; });
      return added.length ? { ...state, threads: [...merged, ...added].sort((x, y) => y.updatedAt - x.updatedAt) } : { ...state, threads: merged };
    }
    case "hydrate":
      if (a.scope !== state.scope) return state;
      return { ...state, threads: state.threads.map((t) => (t.id === a.id ? { ...t, messages: a.messages.map(settleImage).map(settleStudio), remote: false, ...(a.specialistId !== undefined ? { specialistId: a.specialistId ?? undefined } : {}) } : t)) };
    case "forget-remote":
      return { ...state, threads: state.threads.filter((t) => !t.remote) };
    case "view":
      return { ...state, view: a.view, projectFilter: a.projectFilter === undefined ? state.projectFilter : a.projectFilter };
    case "send": {
      const exists = state.threads.find((t) => t.id === a.threadId);
      const now = Date.now();
      const thread: Thread = exists
        ? { ...exists, updatedAt: now, messages: [...exists.messages, a.user, a.keplar] }
        : {
            id: a.threadId, title: topicTitle(a.user.text), titleBy: "auto" as const, projectId: a.projectId ?? null, createdAt: now, updatedAt: now, messages: [a.user, a.keplar],
            ...(state.privateNext ? { private: true } : {}),
            ...(state.specialistNext ? { specialistId: state.specialistNext } : {}),
          };
      return { ...state, activeThreadId: a.threadId, view: "thread", threads: [thread, ...state.threads.filter((t) => t.id !== a.threadId)], ...(exists ? {} : { privateNext: false, specialistNext: null }) };
    }
    case "retry":
      return {
        ...state,
        threads: state.threads.map((t) =>
          t.id !== a.threadId ? t : { ...t, updatedAt: Date.now(), messages: t.messages.map((m): Message => (m.id === a.keplarId ? a.next : m)) },
        ),
      };
    case "event": {
      let next = patchKeplar(state, a.threadId, a.keplarId, (m) => applyEvent(m, a.event));
      // Optimistic until the next /api/compute sync (the server already charged it).
      if (a.event.type === "answer") next = { ...next, ledger: { ...next.ledger, used: next.ledger.used + a.event.answer.compute.units } };
      if (a.event.type === "daily") next = { ...next, ledger: { ...next.ledger, daily: a.event.daily } };
      if (a.event.type === "limit" && a.event.budget === "day") next = { ...next, ledger: { ...next.ledger, paused: true } };
      else if (a.event.type === "limit" && a.event.daily) next = { ...next, ledger: { ...next.ledger, daily: { used: a.event.daily.limit, limit: a.event.daily.limit, left: 0, resetsAt: a.event.daily.resetsAt } } };
      else if (a.event.type === "limit" && !a.event.window) next = { ...next, ledger: { ...next.ledger, used: Math.max(next.ledger.used, allowance(next) - a.event.remaining) } };
      return next;
    }
    case "fail":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => ({ ...m, status: "error", error: a.error, finishedAt: Date.now() }));
    case "stop":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.status === "running" ? { ...m, status: "stopped", finishedAt: Date.now() } : m));
    case "add-project":
      return { ...state, projects: [...state.projects, a.project] };
    case "rename-project":
      return { ...state, projects: state.projects.map((p) => (p.id === a.id ? { ...p, name: a.name } : p)) };
    case "merge-projects": {
      if (a.scope !== state.scope) return state;
      const have = new Set(state.projects.map((p) => p.id));
      const add = a.projects.filter((p) => !have.has(p.id));
      return add.length ? { ...state, projects: [...state.projects, ...add] } : state;
    }
    case "remove-project": {
      const gone = a.chats === "delete" ? new Set(state.threads.filter((t) => t.projectId === a.id).map((t) => t.id)) : new Set<string>();
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== a.id),
        threads: state.threads.filter((t) => !gone.has(t.id)).map((t) => (t.projectId === a.id ? { ...t, projectId: null } : t)),
        activeThreadId: state.activeThreadId && gone.has(state.activeThreadId) ? null : state.activeThreadId,
        projectFilter: state.projectFilter === a.id ? null : state.projectFilter,
      };
    }
    case "drop-project-chats": {
      const gone = new Set(state.threads.filter((t) => t.projectId === a.id).map((t) => t.id));
      return { ...state, threads: state.threads.filter((t) => !gone.has(t.id)), activeThreadId: state.activeThreadId && gone.has(state.activeThreadId) ? null : state.activeThreadId };
    }
    case "move-thread":
      return { ...state, threads: state.threads.map((t) => (t.id === a.id ? { ...t, projectId: a.projectId } : t)) };
    case "settings":
      return { ...state, settings: { ...state.settings, ...a.settings } };
    case "ledger":
      return { ...state, ledger: { ...a.ledger, synced: true } };
    case "image":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.image ? { ...m, image: { ...m.image, ...a.patch } } : m));
    case "studio":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.studio ? { ...m, studio: { ...m.studio, ...a.patch } } : m));
    case "create":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.create ? { ...m, create: { ...m.create, ...a.patch } } : m));
    case "workspace":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.workspace ? { ...m, workspace: { ...m.workspace, ...a.patch } } : m));
    case "errand":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => (m.errand ? { ...m, errand: { ...m.errand, ...a.patch } } : m));
    case "upsell":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => ({ ...m, upsell: a.reason ?? undefined }));
    case "agentFlow":
      return patchKeplar(state, a.threadId, a.keplarId, (m) => ({ ...m, agentFlow: { phase: "ready", steps: [], approvals: [], ...m.agentFlow, ...a.patch } }));
  }
}
