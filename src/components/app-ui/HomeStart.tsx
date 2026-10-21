"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PINNED_QUESTION, STARTERS } from "@/lib/faq/constants";
import type { ComposerModes } from "@/lib/orchestration/types";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import type { Ledger, View } from "./state/types";
import s from "./App.module.css";
import { IconCreate, IconProjects, IconSearch, IconStudy } from "./icons";

type Props = {
  showBusiness: boolean;
  onSeed: (text: string, modes: Partial<ComposerModes>) => void;
  onView: (v: View) => void;
  /** Sends a question as typed, in the normal answer flow. */
  onSend: (text: string) => void;
  /** Extra ideas (use-for examples) shown inside the quiet "More ideas" disclosure, above the frequently asked list. */
  more?: ReactNode;
  /** Caller's plan once known: Free and Lite don't include Deep Research, so "Research a topic" says so (the composer then shows the "Plus and up" note). */
  plan?: Ledger["plan"];
};

type FaqItem = { text: string; people?: number; kind: "pinned" | "frequent" | "starter" };

/** Shown at once (no empty flash) and if /api/faq cannot be reached: the pinned question, then generic starters. No counts. */
const FALLBACK: FaqItem[] = [{ text: PINNED_QUESTION, kind: "pinned" }, ...STARTERS.slice(0, 4).map((text) => ({ text, kind: "starter" as const }))];

type Tile = { id: string; title: string; body: string; run: () => void };

/** Line icons for the starter chips (24px grid, drawn with the chip's text color). */
// Keplar Icons v2 (./icons): the same set as the rest of the app, not stock glyphs.
const TILE_ICONS: Record<string, ReactNode> = {
  research: <IconSearch size={16} className={s.homeChipIcon} />,
  create: <IconCreate size={16} className={s.homeChipIcon} />,
  study: <IconStudy size={16} className={s.homeChipIcon} />,
  project: <IconProjects size={16} className={s.homeChipIcon} />,
};

/**
 * Empty-thread home, calm version: a few one-line suggestion chips (real entry points), then everything else behind a quiet
 * "More ideas" disclosure: the use-for examples and "Most frequently asked question", which lists "Are you conscious?" first (always),
 * then questions that at least a minimum number of different opted-in people really asked (a daily snapshot from /api/faq, shown with the
 * number of people), then generic starters only while there is not enough real data. Clicking an entry sends it.
 * "Ask a question" is the composer itself. Create and Study turn that mode on in the composer; Projects opens beside the thread.
 */
export function HomeStart({ showBusiness: _showBusiness, onSeed, onView, onSend, more, plan }: Props) {
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
    { id: "research", title: "Research a topic", body: plan && !PLAN_ALLOWANCES[plan].deepResearch ? "Deep Research is available on Plus and up." : "Deep Research mode on, you write the question.", run: () => onSeed("", { deepResearch: true }) },
    { id: "create", title: "Create a website or app", body: "Create mode on. Describe it in the chat.", run: () => onSeed("", { create: true }) },
    { id: "study", title: "Study something", body: "Study mode on. A topic becomes flashcards and a quiz.", run: () => onSeed("", { study: true }) },
    { id: "project", title: "Start a project", body: "Keep related threads together.", run: () => onView("projects") },
  ];

  return (
    <>
      <ul className={s.homeChips} aria-label="What you can do">
        {tiles.map((t) => (
          <li key={t.id}>
            <button type="button" className={s.homeChip} data-tile={t.id} title={t.body} onClick={t.run}>
              {TILE_ICONS[t.id]}
              <span className={s.homeChipLabel}>{t.title}</span>
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
