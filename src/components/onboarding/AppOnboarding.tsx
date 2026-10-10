"use client";

import { useEffect, useRef, useState } from "react";
import { BUSINESS_URL } from "@/lib/business-site";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { View } from "@/components/app-ui/state/types";
import { needsWelcome, welcomePath, type ChecklistId } from "@/lib/onboarding/model";
import { AuthLost, loadOnboarding, markProgress, replayOnboarding, type Payload } from "./api";
import { greetName } from "@/lib/onboarding/greet";
import s from "./app-onboarding.module.css";

const REDIRECTED = "keplar.onboarding.redirected";

type Props = {
  /** Sends a question exactly as if it had been typed. */
  onAsk: (text: string) => void;
  onView: (v: View) => void;
  /** Changes when the account's conversations change, so "ask your first question" ticks off as soon as it is true. */
  refresh: number;
  /** Called once, when the first load of the onboarding state has finished (even if it failed or there is nothing to show). */
  onSettled?: () => void;
};

/**
 * Inside /app, above the usual home tiles: (1) after sign-up, a live "try your first question" prompt with starters that follow what
 * the person said they'd use Keplar for; (2) a dismissible checklist whose ticks come from real data; (3) for accounts that predate
 * onboarding, a quiet "Take the tour" line. Renders nothing for signed-out visitors and never blocks asking.
 */
export function AppOnboarding({ onAsk, onView, refresh, onSettled }: Props) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; });

  const [tick, setTick] = useState(0);
  // Load on mount, when the conversations change (so "ask your first question" ticks at once) and when the tab regains focus.
  useEffect(() => {
    let live = true;
    loadOnboarding()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live && e instanceof AuthLost) setData(null); /* anything else: render nothing rather than an error on the home screen */ })
      .finally(() => { if (live) onSettledRef.current?.(); });
    return () => { live = false; };
  }, [refresh, tick]);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, []);

  // Safety net for sign-in paths that skip /welcome: if this account has never seen the flow, offer it once per browser session.
  useEffect(() => {
    if (!data || !needsWelcome(data.state) || data.state.startedAt) return;
    try {
      if (sessionStorage.getItem(REDIRECTED)) return;
      sessionStorage.setItem(REDIRECTED, "1");
    } catch { return; }
    router.replace(welcomePath("/app"));
  }, [data, router]);

  // "Finish and open Connected apps" from the last onboarding step.
  useEffect(() => {
    if (!data || opened.current) return;
    try {
      if (sessionStorage.getItem("keplar.onboarding.open") === "apps") {
        sessionStorage.removeItem("keplar.onboarding.open");
        opened.current = true;
        window.location.assign(BUSINESS_URL);
      }
    } catch { /* optional */ }
  }, [data, onView]);

  if (!data || !data.state.enabled) return null;
  const { state } = data;
  const finished = state.status === "completed" || state.status === "skipped";

  const mark = async (key: "checklistDismissed" | "tourDismissed" | "triedCreate") => {
    try { setData(await markProgress(key)); } catch { /* the choice just isn't remembered */ }
  };
  const tour = async () => {
    setBusy(true);
    try { await replayOnboarding(); router.push(welcomePath("/app")); } catch { setBusy(false); }
  };
  const act = (id: ChecklistId) => {
    if (id === "create") { void mark("triedCreate"); onView("create"); }
    else if (id === "connect") window.location.assign(BUSINESS_URL);
  };

  // Not finished yet but already started: a link back in, never a gate.
  if (state.required && !finished) {
    return (
      <section className={s.card} aria-labelledby="ob-resume-h">
        <h2 id="ob-resume-h" className={s.h}>Finish setting up Keplar</h2>
        <p className={s.p}>You&apos;re on step {Math.min(5, state.step + 1)} of 5. It takes under a minute, and you can keep using Keplar meanwhile.</p>
        <div className={s.actions}><Link href={welcomePath("/app")} className={`${s.btn} ${s.primary}`}>Continue setup</Link></div>
      </section>
    );
  }

  if (state.status === "legacy") {
    if (state.progress.tourDismissed) return null;
    return (
      <p className={s.tour}>
        New here? <button type="button" className={s.linkBtn} onClick={() => void tour()} disabled={busy}>Take the one-minute tour</button>
        <button type="button" className={s.x} onClick={() => void mark("tourDismissed")} aria-label="Hide the tour link">×</button>
      </p>
    );
  }

  const items = data.checklist;
  const open = items.filter((i) => !i.done).length;
  const showChecklist = !state.progress.checklistDismissed && open > 0;
  const showFirst = !data.firstQuestionDone;
  if (!showFirst && !showChecklist) return null;

  return (
    <div className={s.stack} data-testid="app-onboarding">
      {showFirst ? (
        <section className={s.card} aria-labelledby="ob-first-h">
          <h2 id="ob-first-h" className={s.h}>{greetName(data.name) ? `${greetName(data.name)}, try your first question` : "Try your first question"}</h2>
          <p className={s.p}>Pick one, or type your own below. Keplar asks several models, checks where they disagree, and writes one answer.</p>
          <ul className={s.starters} aria-label="Suggested first questions">
            {data.starters.map((st) => (
              <li key={st.text}>
                <button type="button" className={s.starter} onClick={() => onAsk(st.text)}>
                  <span>{st.text}</span>
                  <span className={s.hint}>{st.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={s.fine}>{data.plan.line}</p>
        </section>
      ) : null}
      {showChecklist ? (
        <section className={s.card} aria-labelledby="ob-check-h">
          <div className={s.head}>
            <h2 id="ob-check-h" className={s.h}>Getting started <span className={s.count}>{items.length - open} of {items.length}</span></h2>
            <button type="button" className={s.ghost} onClick={() => void mark("checklistDismissed")}>Hide</button>
          </div>
          <ul className={s.checks}>
            {items.map((i) => (
              <li key={i.id} className={s.check} data-done={i.done || undefined}>
                <span className={s.tick} aria-hidden="true">{i.done ? "✓" : ""}</span>
                {i.done ? (
                  <span className={s.done}><span className={s.srOnly}>Done: </span>{i.label}</span>
                ) : i.href ? (
                  <Link href={i.href} className={s.item}>{i.label}</Link>
                ) : i.id === "ask" ? (
                  <span className={s.item}>{i.label}</span>
                ) : (
                  <button type="button" className={`${s.item} ${s.itemBtn}`} onClick={() => act(i.id)}>{i.label}</button>
                )}
                {!i.done && i.note ? <span className={s.badge} data-kind={i.note === "Beta" ? "beta" : undefined}>{i.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
