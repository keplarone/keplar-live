"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { Action } from "./state/store";
import type { AppState, Message, Thread } from "./state/types";
import { activeScopeHeaders, userIdOf } from "./state/scope";

const idle = (t: Thread) => !t.messages.some((m) => m.role === "keplar" && m.status === "running");

async function call(url: string, method: string, body?: unknown) {
  // The account header makes the server refuse the call if the session now belongs to a different account than the chats on screen.
  const res = await fetch(url, { method, cache: "no-store", headers: { ...(body ? { "content-type": "application/json" } : {}), ...activeScopeHeaders() }, body: body ? JSON.stringify(body) : undefined });
  return res;
}

/**
 * Signed-in users: chats are saved on the server (list, reopen, rename, delete). Signed-out chats never leave the browser.
 * Only chats that change while signed in are uploaded; older local chats stay local until you continue them.
 */
export function useChatSync(state: AppState, dispatch: Dispatch<Action>, onAccountChanged?: () => void) {
  // Signed in as exactly one account; every request below is for it, and answers for any other account are dropped.
  const scope = state.scope;
  const signedIn = userIdOf(scope) !== null;
  const saved = useRef(new Map<string, number>()); // thread id -> updatedAt last saved
  // Is memory on for this account? null until known (and while signed out: there is no memory then).
  const [memoryFor, setMemoryFor] = useState<{ scope: string; on: boolean } | null>(null);
  const memory = memoryFor && memoryFor.scope === scope ? memoryFor.on : null;
  const setMemory = useCallback((on: boolean) => setMemoryFor({ scope, on }), [scope]);
  const changed = useRef(onAccountChanged);
  useEffect(() => { changed.current = onAccountChanged; }, [onAccountChanged]);

  // Per account: forget everything tracked for the previous one, then load this account's memory flag and chat list.
  useEffect(() => {
    saved.current = new Map();
    if (!signedIn) return;
    let live = true;
    void call("/api/memory", "GET").then(async (r) => {
      if (live && r.ok) setMemoryFor({ scope, on: ((await r.json()) as { enabled: boolean }).enabled });
    }).catch(() => undefined);
    void call("/api/chats", "GET").then(async (r) => {
      if (!live) return;
      if (r.status === 409) return changed.current?.();
      if (!r.ok) return;
      const j = (await r.json()) as { chats: { id: string; title: string; projectId: string | null; createdAt: number; updatedAt: number; specialistId?: string }[] };
      if (!live) return;
      for (const c of j.chats) saved.current.set(c.id, c.updatedAt);
      dispatch({ type: "merge-remote", scope, chats: j.chats });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [scope, signedIn, dispatch]);

  // Debounced save of whatever changed.
  useEffect(() => {
    if (!signedIn) return;
    const t = window.setTimeout(() => {
      for (const th of state.threads) {
        if (th.remote || th.private || !th.messages.length || !idle(th)) continue;
        if (saved.current.get(th.id) === th.updatedAt) continue;
        if (!state.threads.length) continue;
        saved.current.set(th.id, th.updatedAt);
        void call(`/api/chats/${encodeURIComponent(th.id)}`, "PUT", { title: th.title, projectId: th.projectId, createdAt: th.createdAt, updatedAt: th.updatedAt, messages: th.messages, specialistId: th.specialistId ?? null }).then((r) => { if (!r.ok) saved.current.delete(th.id); if (r.status === 409) changed.current?.(); }).catch(() => saved.current.delete(th.id));
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [state.threads, signedIn]);

  const hydrate = useCallback(async (id: string) => {
    const r = await call(`/api/chats/${encodeURIComponent(id)}`, "GET");
    if (r.status === 409) return changed.current?.();
    if (!r.ok) return;
    const j = (await r.json()) as { chat: { messages: Message[]; updatedAt: number; specialistId?: string | null } };
    saved.current.set(id, j.chat.updatedAt);
    dispatch({ type: "hydrate", scope, id, messages: j.chat.messages, specialistId: j.chat.specialistId ?? null });
  }, [dispatch, scope]);

  /** Save one local chat to the signed-in account right now (used by "Import chats from this device"). */
  const upload = useCallback(async (th: Thread): Promise<"ok" | "rate" | "fail"> => {
    try {
      const r = await call(`/api/chats/${encodeURIComponent(th.id)}`, "PUT", { title: th.title, projectId: th.projectId, createdAt: th.createdAt, updatedAt: th.updatedAt, messages: th.messages, specialistId: th.specialistId ?? null });
      if (r.status === 409) changed.current?.();
      if (r.ok) { saved.current.set(th.id, th.updatedAt); return "ok"; }
      return r.status === 429 ? "rate" : "fail";
    } catch {
      return "fail";
    }
  }, []);

  const rename = useCallback((id: string, title: string) => {
    dispatch({ type: "rename-thread", id, title });
    if (signedIn) void call(`/api/chats/${encodeURIComponent(id)}`, "PATCH", { title }).catch(() => undefined);
  }, [dispatch, signedIn]);

  /** Move a chat into a project (or out, null). The server copy follows, so project export, clear and project memory see the right chats. */
  const move = useCallback((id: string, projectId: string | null) => {
    dispatch({ type: "move-thread", id, projectId });
    if (signedIn) void call(`/api/chats/${encodeURIComponent(id)}`, "PATCH", { projectId }).catch(() => undefined);
  }, [dispatch, signedIn]);

  const remove = useCallback((id: string) => {
    dispatch({ type: "delete-thread", id });
    saved.current.delete(id);
    if (signedIn) void call(`/api/chats/${encodeURIComponent(id)}`, "DELETE").catch(() => undefined);
  }, [dispatch, signedIn]);

  /** A topic title for a chat (never replaces a title the person wrote). Signed in: saved on the server too. */
  const retitle = useCallback((id: string, title: string) => {
    dispatch({ type: "set-topic-title", id, title, final: true });
    if (!signedIn) return;
    void call(`/api/chats/${encodeURIComponent(id)}`, "PATCH", { title }).then((r) => { if (!r.ok) saved.current.delete(id); /* not saved yet: the next save carries the new title */ }).catch(() => undefined);
  }, [dispatch, signedIn]);

  /** Optimistic delete step 1: take the chat off the screen only (nothing is sent). Undo uses `restore`; `commit` makes it permanent. */
  const drop = useCallback((id: string) => {
    dispatch({ type: "delete-thread", id });
    saved.current.delete(id);
  }, [dispatch]);
  const restore = useCallback((thread: Thread, open: boolean) => dispatch({ type: "restore-thread", thread, open }), [dispatch]);
  /** Step 2 (after the undo window): delete it on the server for good. Signed-out chats only ever lived in this browser. */
  const commit = useCallback((id: string, keepalive = false) => {
    if (!signedIn) return;
    void fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store", keepalive, headers: activeScopeHeaders() }).catch(() => undefined);
  }, [signedIn]);

  return { hydrate, rename, retitle, move, remove, drop, restore, commit, upload, signedIn, memory: signedIn ? memory : null, setMemory };
}
