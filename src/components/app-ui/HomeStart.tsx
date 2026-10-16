"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PINNED_QUESTION, STARTERS } from "@/lib/faq/constants";
import type { ComposerModes } from "@/lib/orchestration/types";
import type { View } from "./state/types";
import s from "./App.module.css";
import h from "./HomeStart.module.css";

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

type Idea = { id: string; title: string; hint: string; run: () => void };

/** Full-colour app-style icons on a small white tile, so they read on both themes. Gmail is shown because Keplar connects to it. */
const IDEA_ICONS: Record<string, ReactNode> = {
  build: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="3.5" fill="#26282d" /><path d="M9 9.5 6.5 12 9 14.5M15 9.5l2.5 2.5-2.5 2.5" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="m12.8 8.8-1.6 6.4" stroke="#fbbc04" strokeWidth="1.8" strokeLinecap="round" /></svg>
  ),
  order: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8z" fill="#e8823a" /><path d="M9 10V7a3 3 0 0 1 6 0v3" fill="none" stroke="#7a3d12" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  trip: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15.5v-1.7l-7.5-4.6V4.6a1.5 1.5 0 0 0-3 0v4.6L3 13.8v1.7l7.5-2.3v4.6L8.6 19.2v1.3l3.4-1 3.4 1v-1.3l-1.9-1.4v-4.6z" fill="#3b82c4" /></svg>
  ),
  email: (
    <svg width="18" height="14" viewBox="52 42 88 66" aria-hidden="true"><path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" /><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" /><path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" /><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" /><path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" /></svg>
  ),
  picture: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2s-.6-1.4-.6-2.2c0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" fill="#f3dfbf" stroke="#c9a26a" strokeWidth="1" /><circle cx="7.5" cy="11" r="1.6" fill="#ea4335" /><circle cx="10" cy="7" r="1.6" fill="#fbbc04" /><circle cx="14.5" cy="7" r="1.6" fill="#34a853" /><circle cx="17.5" cy="10.5" r="1.6" fill="#4285f4" /></svg>
  ),
  research: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="#e9ecf1" stroke="#26282d" strokeWidth="2" /><path d="m15.5 15.5 5 5" stroke="#26282d" strokeWidth="2.4" strokeLinecap="round" /></svg>
  ),
};

/**
 * Empty-thread home: a row of 3D idea pills (each one a real entry point that fills the composer or opens a tool), a pill for
 * Space Studio, and everything else behind a quiet "More ideas" disclosure: the use-for examples and "Most frequently asked
 * question", which lists "Are you conscious?" first (always), then questions that at least a minimum number of different opted-in
 * people really asked (a daily snapshot from /api/faq), then generic starters only while there is not enough real data.
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
  const ideas: Idea[] = [
    { id: "build", title: "Build an app", hint: "Describe it, preview it, publish it", run: () => onView("create") },
    { id: "order", title: "Order something", hint: "Keplar fills the order; you confirm and pay", run: () => onSeed("Order ", {}) },
    { id: "trip", title: "Plan a trip", hint: "Where, when, and a day-by-day plan", run: () => onSeed("Plan a trip to ", {}) },
    { id: "email", title: "Write an email", hint: "Say who it's to and what it's about", run: () => onSeed("Write an email to ", {}) },
    { id: "picture", title: "Make a picture", hint: "Describe what you want to see", run: () => onSeed("Make a picture of ", {}) },
    { id: "research", title: "Research a topic", hint: "Deep Research reads the sources for you", run: () => onSeed("", { deepResearch: true }) },
  ];

  return (
    <>
      <ul className={h.ideas} aria-label="Ideas to start with">
        {ideas.map((t, i) => (
          <li key={t.id} className="k-enter" style={{ ["--i" as string]: i + 2 }}>
            <button type="button" className={`k3d ${h.idea}`} data-idea={t.id} title={t.hint} onClick={t.run}>
              <span className={h.tile}>{IDEA_ICONS[t.id]}</span>
              {t.title}
            </button>
          </li>
        ))}
      </ul>
      <p className={`${h.limits} k-enter`} style={{ ["--i" as string]: 9 }}>Keplar does almost anything you ask. It won&apos;t help with anything illegal, hacking or adult content.</p>
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

/** The headline block of the empty home: a small greeting, the promise, and a quiet pill to Space Studio. */
export function HomeHero({ greeting, hidden }: { greeting: ReactNode; hidden?: boolean }) {
  return (
    <div className={h.hero} data-home-hero="" style={hidden ? { visibility: "hidden" } : undefined}>
      <Link className={`k3d ${h.space} k-enter`} href="/space-studio" style={{ ["--i" as string]: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static icon */}
        <img src="/icons/space-studio.png" alt="" width={26} height={26} />
        <span>Try Space Studio</span>
        <span className={h.spaceHint}>Build for Roblox and Blender</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
      <p className={`${h.greet} k-enter`} style={{ ["--i" as string]: 1 }}>{greeting}</p>
      <h1 className={`${h.title} k-enter`} style={{ ["--i" as string]: 1 }}>Ask for the outrageous.</h1>
      <p className={`${h.lede} k-enter`} style={{ ["--i" as string]: 2 }}>Anything legal, done start to finish.</p>
    </div>
  );
}
