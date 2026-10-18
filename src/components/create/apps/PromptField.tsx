"use client";
/**
 * The studio's prompt. Typing must feel like a word processor, so the textarea is uncontrolled: a keystroke never re-renders
 * React. Readers subscribe to a tiny store instead: `ready` (enough text to build) flips at most twice per prompt, and `settled`
 * (the text after a 220 ms pause) drives the blueprint and the saved draft. Enter submits; Shift+Enter is a new line.
 */
import { composerEnter, readComposerKey } from "@/lib/composer-keys";
import { forwardRef, useEffect, useImperativeHandle, useRef, useSyncExternalStore } from "react";

type Snapshot = { ready: boolean; settled: string };
export type PromptStore = {
  get: () => Snapshot;
  subscribe: (fn: () => void) => () => void;
  /** Current text, read on demand (not reactive). */
  text: () => string;
  /** @internal */ _set: (s: Partial<Snapshot>) => void;
  /** @internal */ _bind: (read: () => string) => void;
};

export const MIN_PROMPT = 8;

export function createPromptStore(initial = ""): PromptStore {
  let snap: Snapshot = { ready: initial.trim().length >= MIN_PROMPT, settled: initial };
  let read = () => snap.settled;
  const subs = new Set<() => void>();
  return {
    get: () => snap,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    text: () => read(),
    _set: (s) => {
      const next = { ...snap, ...s };
      if (next.ready === snap.ready && next.settled === snap.settled) return;
      snap = next;
      for (const f of subs) f();
    },
    _bind: (r) => {
      read = r;
    },
  };
}

export const usePromptReady = (store: PromptStore) => useSyncExternalStore(store.subscribe, () => store.get().ready, () => store.get().ready);
export const usePromptSettled = (store: PromptStore) => useSyncExternalStore(store.subscribe, () => store.get().settled, () => store.get().settled);

export type PromptHandle = { focus: () => void; set: (text: string) => void; clear: () => void };

type Props = {
  store: PromptStore;
  onSubmit: () => void;
  className?: string;
  placeholder: string;
  label: string;
  maxLength?: number;
  draftKey?: string;
  autoFocus?: boolean;
  id?: string;
};

export const PromptField = forwardRef<PromptHandle, Props>(function PromptField({ store, onSubmit, className, placeholder, label, maxLength = 16000, draftKey, autoFocus, id }, ref) {
  const el = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = useRef(onSubmit);
  useEffect(() => {
    submit.current = onSubmit;
  });

  const settle = (v: string) => {
    store._set({ settled: v });
    if (draftKey) {
      try {
        if (v.trim()) sessionStorage.setItem(draftKey, v);
        else sessionStorage.removeItem(draftKey);
      } catch {
        /* private mode */
      }
    }
  };
  const changed = (v: string, immediate = false) => {
    store._set({ ready: v.trim().length >= MIN_PROMPT });
    if (timer.current) clearTimeout(timer.current);
    if (immediate) settle(v);
    else timer.current = setTimeout(() => settle(v), 220);
  };

  useEffect(() => {
    const t = el.current;
    if (!t) return;
    store._bind(() => t.value);
    if (!t.value) {
      let draft = store.get().settled;
      if (!draft && draftKey) {
        try {
          draft = sessionStorage.getItem(draftKey) ?? "";
        } catch {
          draft = "";
        }
      }
      if (draft) {
        t.value = draft;
        changed(draft, true);
      }
    }
    if (autoFocus && window.matchMedia("(min-width: 900px)").matches) t.focus({ preventScroll: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const t = el.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    },
    set: (text: string) => {
      const t = el.current;
      if (!t) return;
      t.value = text;
      changed(text, true);
      t.focus();
      t.setSelectionRange(text.length, text.length);
      t.scrollTop = t.scrollHeight;
    },
    clear: () => {
      const t = el.current;
      if (!t) return;
      t.value = "";
      changed("", true);
    },
  }));

  return (
    <textarea
      ref={el}
      id={id}
      className={className}
      placeholder={placeholder}
      aria-label={label}
      maxLength={maxLength}
      spellCheck
      autoComplete="off"
      enterKeyHint="go"
      onInput={(e) => changed(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        const action = composerEnter(readComposerKey(e), { canSend: e.currentTarget.value.trim().length > 0 });
        if (action === "newline") return;
        e.preventDefault();
        if (action !== "send") return;
        if (timer.current) clearTimeout(timer.current);
        settle(e.currentTarget.value);
        submit.current();
      }}
    />
  );
});
