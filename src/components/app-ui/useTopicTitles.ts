"use client";
import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { activeScopeHeaders } from "./state/scope";
import type { Action } from "./state/store";
import { legacyTitle, modelEligible, topicTitle } from "@/lib/chat-title";
import type { Thread } from "./state/types";

const answered = (t: Thread) => t.messages.some((m) => m.role === "keplar" && m.status !== "running") && !t.messages.some((m) => m.role === "keplar" && m.status === "running");

/**
 * Titles chats by topic, never blocking anything:
 *  - a new chat already has an instant heuristic title ("auto"),
 *  - chats made before topic titles that still carry their first message as the title get the heuristic topic title once, when they are on screen with their messages
 *    (a title the person wrote is different from the first message, so it is left alone),
 *  - after the first answer, signed-in people get one free-model refinement; everyone else (and any failure) keeps the heuristic title.
 */
export function useTopicTitles(threads: Thread[], dispatch: Dispatch<Action>, signedIn: boolean, retitle: (id: string, title: string) => void) {
  const busy = useRef(new Set<string>());
  const done = useRef(new Set<string>());
  const latest = useRef({ signedIn, retitle });
  useEffect(() => { latest.current = { signedIn, retitle }; });

  useEffect(() => {
    for (const t of threads) {
      if (t.titleBy === "user" || t.titleBy === "topic" || done.current.has(t.id) || busy.current.has(t.id)) continue;
      const first = t.messages.find((m) => m.role === "user");
      if (!first || first.role !== "user") continue;
      if (t.titleBy === undefined) {
        // Made before topic titles: only the untouched first-message title is replaced.
        if (t.title !== legacyTitle(first.text)) { done.current.add(t.id); continue; }
        // Old chats are renamed once, for free (no model), and the new title is saved with the account.
        done.current.add(t.id);
        latest.current.retitle(t.id, topicTitle(first.text));
        continue;
      }
      if (!answered(t)) continue;
      const q = first.text;
      const last = [...t.messages].reverse().find((m) => m.role === "keplar" && m.answer);
      const answer = last && last.role === "keplar" ? last.answer?.markdown ?? "" : "";
      const heuristic = topicTitle(q);
      const finish = (title: string) => { busy.current.delete(t.id); done.current.add(t.id); latest.current.retitle(t.id, title); };
      if (!latest.current.signedIn || !modelEligible(q)) { done.current.add(t.id); finish(heuristic); continue; }
      busy.current.add(t.id);
      void fetch("/api/chat-title", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...activeScopeHeaders() }, body: JSON.stringify({ question: q.slice(0, 500), answer: answer.slice(0, 500) }) })
        .then(async (r) => (r.ok ? ((await r.json()) as { title?: string }).title : undefined))
        .catch(() => undefined)
        .then((title) => finish(typeof title === "string" && title.trim() ? title.trim() : heuristic));
    }
  }, [threads, dispatch]);
}
