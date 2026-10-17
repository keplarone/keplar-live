"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PINNED_QUESTION, STARTERS } from "@/lib/faq/constants";
import type { ComposerModes } from "@/lib/orchestration/types";
import type { View } from "./state/types";
import s from "./App.module.css";

type Props = {
  showBusiness: boolean;
  onSeed: (text: string, modes: Partial<ComposerModes>) => void;
  onView: (v: View) => void;
  /** Sends a question as typed, in the normal answer flow. */
  onSend: (text: string) => void;
  /** Extra ideas (use-for examples) shown inside the quiet "More ideas" disclosure, above the frequently asked list. */
  more?: ReactNode;
};

type FaqItem = { text: string; people?: number; kind: "pinned" | "frequent" | "starter" };

/** Shown at once (no empty flash) and if /api/faq cannot be reached: the pinned question, then generic starters. No counts. */
const FALLBACK: FaqItem[] = [{ text: PINNED_QUESTION, kind: "pinned" }, ...STARTERS.slice(0, 4).map((text) => ({ text, kind: "starter" as const }))];

type Tile = { id: string; title: string; body: string; run: () => void };

/** Line icons for the starter chips (24px grid, drawn with the chip's text color). */
const TILE_ICONS: Record<string, ReactNode> = {
  research: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  create: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />,
  study: <><path d="M4 6l8-3 8 3-8 3-8-3z" /><path d="M8 8v5c0 1.5 2 3 4 3s4-1.5 4-3V8" /></>,
  project: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
};

/**
 * Empty-thread home, calm version: a few one-line suggestion chips (real entry points), then everything else behind a quiet
 * "More ideas" disclosure: the use-for examples and "Most frequently asked question", which lists "Are you conscious?" first (always),
 * then questions that at least a minimum number of different opted-in people really asked (a daily snapshot from /api/faq, shown with the
 * number of people), then generic starters only while there is not enough real data. Clicking an entry sends it.
 * "Ask a question" is the composer itself; Projects and Business stay one click away in the sidebar.
 */
export function HomeStart({ showBusiness: _showBusiness, onSeed, onView, onSend, more }: Props) {
  const [faq, setFaq] = useState<FaqItem[]>(FALLBACK);
  const [faqState, setFaqState] = useState<"loading" | "loaded" | "fallback">("loading");
  useEffect(() => {
    let live = true;
    fetch("/api/faq").then((r) => (r.ok ? r.json() : null)).then((j: { items?: FaqItem[] } | null) => {
      const items = j?.items?.filter((x) => x && typeof x.text === "string" && x.text.length <= 140).slice(0, 6);
      if (!live) return;
      if (items?.length && items[0].kind === "pinned") { setFaq(items); setFaqState("loaded"); } else setFaqState("fallback");
    }).catch(() => { if (live) setFaqState("fallback"); });
    return () => { live = false; };
  }, []);
  const tiles: Tile[] = [
    { id: "research", title: "Research a topic", body: "Deep Research mode on, you write the question.", run: () => onSeed("", { deepResearch: true }) },
    { id: "create", title: "Create an app or image", body: "Describe it, preview it, publish it.", run: () => onView("create") },
    { id: "study", title: "Study something", body: "Notes or a topic into flashcards and a quiz.", run: () => onView("study") },
    { id: "project", title: "Start a project", body: "Keep related threads together.", run: () => onView("projects") },
  ];

  return (
    <>
      <ul className={s.homeChips} aria-label="What you can do">
        {tiles.map((t) => (
          <li key={t.id}>
            <button type="button" className={s.homeChip} data-tile={t.id} title={t.body} onClick={t.run}>
              <span className={s.chipLens} data-glass-pill="" data-distort="" aria-hidden="true" data-glass-chip="" />
              <svg className={s.homeChipIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TILE_ICONS[t.id]}</svg>
              <span className={s.chipLabel}>{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <details className={s.homeMore} data-home-more="">
        <summary className={s.homeMoreSummary}>More ideas</summary>
        {more}
        <section className={s.homeRecent} aria-labelledby="home-faq-h" data-testid="home-faq" data-faq={faqState}>
          <h2 id="home-faq-h" className={s.sideLabel}>Most frequently asked question</h2>
          <ul className={s.homeRecentList}>
            {faq.map((q) => (
              <li key={q.text}>
                <button type="button" className={s.homeRecentItem} onClick={() => onSend(q.text)}>
                  {q.text}
                  {q.kind === "frequent" && q.people ? <span className={s.homeRecentKind}>{q.people} people</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </details>
    </>
  );
}
