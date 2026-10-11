"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { ComposerModes } from "@/lib/orchestration/types";
import type { Thread } from "./state/types";
import s from "./WelcomeBack.module.css";

/** sessionStorage key: the welcome-back screen shows once per visit (a new tab or window is a new visit). */
export const WELCOME_BACK_KEY = "keplar-welcome-back";

const MODELS = [
  { src: "/models/claude.svg", name: "Claude" },
  { src: "/models/chatgpt.svg", name: "ChatGPT" },
  { src: "/models/gemini.svg", name: "Gemini" },
  { src: "/models/deepseek.svg", name: "DeepSeek" },
  { src: "/models/mistral.svg", name: "Mistral" },
  { src: "/models/grok.svg", name: "Grok" },
];

/** Starters: each fills the composer with a beginning to finish (the person still writes the question), and may switch a mode on. */
const STARTERS: { label: string; seed: string; tone: string; icon: React.ReactNode; modes?: Partial<ComposerModes> }[] = [
  { label: "Research a topic", seed: "Research ", modes: { deepResearch: true }, tone: "teal", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
  { label: "Compare options", seed: "Compare ", tone: "amber", icon: <path d="M7 7h10M7 12h10M7 17h6" /> },
  { label: "Check a claim", seed: "Is this true: ", tone: "green", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { label: "Write", seed: "Help me write ", tone: "brown", icon: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" /> },
  { label: "Code", seed: "Help me with this code: ", tone: "rose", icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /> },
];

const dayGreeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

function ago(ts: number, now: number): string {
  const day = 86_400_000;
  const d = Math.floor((now - ts) / day);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "Last week";
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whether to show it: once per visit, for signed-in people who already have chats. */
export function shouldWelcomeBack(): boolean {
  try { return sessionStorage.getItem(WELCOME_BACK_KEY) === null; } catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(WELCOME_BACK_KEY, "1"); } catch { /* private mode: it may show again, harmless */ }
}

type Props = {
  firstName: string;
  plan: string;
  threads: Thread[];
  /** The app's own Composer (attachments, drag and drop, paste, voice, every mode, the model picker): the same box as in a chat. */
  composer: React.ReactNode;
  /** A starter chip: fill the composer here (and switch a mode on), without leaving the screen. */
  onStarter: (text: string, modes: Partial<ComposerModes>) => void;
  onOpenThread: (id: string) => void;
  onOpenChats: () => void;
  onMenu: () => void;
  onClose: () => void;
};

/**
 * The screen a signed-in person sees when they come back to Keplar (Keplar Canvas, Page 1 "Home"): a greeting by name, one
 * question box, quick starters and the last three chats, over the canvas auras. Anything they do here moves into the app and the
 * screen does not come back until their next visit. Escape or the menu closes it.
 */
export function WelcomeBack({ firstName, plan, threads, composer, onStarter, onOpenThread, onOpenChats, onMenu, onClose }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [now] = useState(() => Date.now());
  const [hour] = useState(() => new Date().getHours());
  const titleId = useId();
  const recent = threads.filter((t) => !t.private && t.title.trim()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);

  const leave = (after: () => void) => {
    markSeen();
    setLeaving(true);
    window.setTimeout(after, 180);
  };

  useEffect(() => {
    // Seen once it has shown: a reload in the same visit goes straight to the app.
    markSeen();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); markSeen(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={s.screen} role="dialog" aria-modal="true" aria-labelledby={titleId} data-leaving={leaving || undefined}>
      <div className={s.auras} aria-hidden="true">
        <span data-a="sky" /><span data-a="lilac" /><span data-a="ice" /><span data-a="peach" /><span data-a="mint" />
        <span className={s.dust} data-d="a" /><span className={s.dust} data-d="b" /><span className={s.dust} data-d="c" />
      </div>

      <header className={s.top}>
        <button type="button" className={s.round} onClick={() => leave(onOpenChats)} aria-label="Open chats">
          <svg viewBox="0 0 398 398" width="22" height="22" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="229" height="229" rx="70" /><path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" /><circle cx="281" cy="281" r="117" /></svg>
        </button>
        <button type="button" className={s.menu} onClick={() => leave(onMenu)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 9h14M5 15h14" /></svg>
          Menu
        </button>
        {plan === "free" ? <Link href="/pricing" className={s.upgrade} onClick={markSeen}>Upgrade</Link> : <span className={s.topSpacer} />}
      </header>

      <main className={s.body}>
        <div className={s.hero}>
          <div className={s.models}>
            <span className={s.faces}>
              {MODELS.map((m) => <Image key={m.name} src={m.src} alt={m.name} title={m.name} width={18} height={18} className={s.face} />)}
            </span>
            Top AI models, one answer
          </div>
          <h1 id={titleId} className={s.title}>
            <span>{dayGreeting(hour)}{firstName ? `, ${firstName}` : ""}</span>
            <span className={s.titleGrey}>What should we look into?</span>
          </h1>
          <p className={s.lede}>Ask once. Keplar sends your question to several AI models, compares what they say, and gives you one clear answer.</p>
        </div>

        <div className={s.ask}>{composer}</div>

        <div className={s.chips}>
          {STARTERS.map((c) => (
            <button key={c.label} type="button" className={s.chip} data-tone={c.tone} onClick={() => onStarter(c.seed, c.modes ?? {})}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icon}</svg>
              {c.label}
            </button>
          ))}
        </div>

        {recent.length ? (
          <section className={s.recent} aria-labelledby={`${titleId}-r`}>
            <h2 id={`${titleId}-r`} className={s.recentTitle}>Pick up where you left off</h2>
            <div className={s.recentGrid}>
              {recent.map((t) => (
                <button key={t.id} type="button" className={s.recentCard} onClick={() => leave(() => onOpenThread(t.id))}>
                  <span className={s.recentName}>{t.title}</span>
                  <span className={s.recentWhen}>{ago(t.updatedAt, now)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <p className={s.foot}>Keplar compares several AI models. Check important answers.</p>
    </div>
  );
}
