"use client";

import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { appSidebar, composerTools, demoAnswer, demoIntelligences, demoQuestion, demoRecent, demoSteps, demoThreadTitle } from "@/lib/demo";
import s from "./ProductDemo.module.css";

type Props = {
  /** Start the run when true; reset when it flips back to false. */
  active: boolean;
  reducedMotion: boolean;
};

const DONE = demoSteps.length;

export const ProductDemo = forwardRef<HTMLDivElement, Props>(function ProductDemo({ active, reducedMotion }, ref) {
  // step index: -1 idle, 0..n-1 running, n = answer
  const [step, setStep] = useState(-1);
  const [chips, setChips] = useState(0);
  const [open, setOpen] = useState<string | null>("consensus");
  const [showSteps, setShowSteps] = useState(false);
  const timers = useRef<number[]>([]);
  const uid = useId();

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const run = useCallback(() => {
    clear();
    if (reducedMotion) {
      setStep(DONE);
      setChips(demoIntelligences.length);
      return;
    }
    setStep(0);
    setChips(0);
    setShowSteps(false);
    let t = 0;
    demoSteps.forEach((st, i) => {
      timers.current.push(window.setTimeout(() => setStep(i), t));
      if (st.id === "select") {
        demoIntelligences.forEach((_, k) => {
          timers.current.push(window.setTimeout(() => setChips(k + 1), t + 180 + k * 190));
        });
      }
      t += st.ms;
    });
    timers.current.push(window.setTimeout(() => setStep(DONE), t));
  }, [reducedMotion]);

  useEffect(() => {
    // Timers only; state changes happen in their callbacks.
    if (active) {
      const t = window.setTimeout(run, 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => { clear(); setStep(-1); setChips(0); }, 0);
    return () => window.clearTimeout(t);
  }, [active, run]);

  useEffect(() => clear, []);

  const answered = step >= DONE;
  const running = step >= 0 && !answered;

  return (
    <div ref={ref} className={s.window} data-stage-window role="region" aria-label="Keplar product example">
      <div className={s.titlebar}>
        <div className={s.titleLeft}>
          <KeplarSymbol size={14} />
          <span className={s.threadTitle}>{demoThreadTitle}</span>
        </div>
        <div className={s.titleRight}>
          <span className={s.example}>Illustrative example</span>
          {answered && !reducedMotion ? (
            <button type="button" className={s.replay} onClick={run}>
              Replay
            </button>
          ) : null}
        </div>
      </div>

      <div className={s.body}>
        <aside className={s.sidebar} aria-hidden="true">
          <div className={s.newThread}>
            <span className={s.plus}>+</span> {appSidebar[0]}
          </div>
          <ul className={s.sideList}>
            {appSidebar.slice(1).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className={s.sideRecent}>
            <span className={s.sideLabel}>Today</span>
            <span className={s.sideItemActive}>{demoThreadTitle}</span>
            {demoRecent.map((t) => (
              <span key={t} className={s.sideItem}>{t}</span>
            ))}
          </div>
        </aside>

        <div className={s.main}>
          <div className={s.thread} aria-live="polite">
            <p className={s.userMsg}>{demoQuestion}</p>

            {step >= 0 ? (
              <div className={s.process} data-collapsed={answered || undefined}>
                {answered ? (
                  <button
                    type="button"
                    className={s.processSummary}
                    aria-expanded={showSteps}
                    aria-controls={`${uid}-steps`}
                    onClick={() => setShowSteps((v) => !v)}
                  >
                    <span className={s.dotDone} aria-hidden="true" />
                    Reasoned with 6 intelligences
                    <span className={s.chev} aria-hidden="true" data-open={showSteps || undefined}>
                      ›
                    </span>
                  </button>
                ) : null}
                <ol id={`${uid}-steps`} className={s.steps} hidden={answered && !showSteps}>
                  {demoSteps.map((st, i) => {
                    if (i > step && !answered) return null;
                    const state = answered || i < step ? "done" : "active";
                    return (
                      <li key={st.id} className={s.step} data-state={state} data-kind={st.id}>
                        <span className={s.stepDot} aria-hidden="true" />
                        <span className={s.stepLabel}>{state === "done" ? st.done : st.label}</span>
                        {st.id === "select" ? (
                          <span className={s.chips}>
                            {demoIntelligences.slice(0, chips).map((c) => (
                              <span key={c} className={s.chip}>
                                {c}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {st.id === "compare" || st.id === "disagree" ? (
                          <span className={s.bars} aria-hidden="true" data-split={st.id === "disagree" || undefined}>
                            {demoIntelligences.map((c, k) => (
                              <span key={c} className={s.bar} data-dissent={k === 3 || undefined} style={{ ["--k" as string]: k }} />
                            ))}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            {/* Always server-rendered (crawlable, no-JS readable); hidden until the run reaches it. */}
            {(
              <article className={s.answer} aria-labelledby={`${uid}-answer`} hidden={step >= 0 && !answered}>
                <header className={s.answerHead}>
                  <h2 id={`${uid}-answer`} className={s.answerTitle}>
                    <KeplarSymbol size={16} />
                    Keplar Answer
                  </h2>
                  <div className={s.consensus} aria-label={`Consensus ${demoAnswer.consensus} percent. ${demoAnswer.agree} agree, ${demoAnswer.disagree} disagrees.`}>
                    <svg className={s.ring} viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="15.5" className={s.ringTrack} />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        className={s.ringValue}
                        pathLength={100}
                        strokeDasharray={`${demoAnswer.consensus} 100`}
                      />
                    </svg>
                    <span className={s.consensusValue}>
                      <span className={s.consensusPct}>{demoAnswer.consensus}%</span>
                      <span className={s.consensusLabel}>Consensus</span>
                    </span>
                    <span className={s.consensusSplit}>
                      <span><i className={s.agreeDot} />{demoAnswer.agree} agree</span>
                      <span><i className={s.dissentDot} />{demoAnswer.disagree} disagrees</span>
                    </span>
                  </div>
                </header>
                <p className={s.answerLead}>{demoAnswer.summary}</p>
                <p className={s.answerBody}>{demoAnswer.body}</p>
                <ul className={s.sections}>
                  {demoAnswer.sections.map((sec) => {
                    const isOpen = open === sec.id;
                    return (
                      <li key={sec.id} className={s.section} data-open={isOpen || undefined}>
                        <h3>
                          <button
                            type="button"
                            className={s.sectionBtn}
                            aria-expanded={isOpen}
                            aria-controls={`${uid}-${sec.id}`}
                            onClick={() => setOpen(isOpen ? null : sec.id)}
                          >
                            <span className={s.sectionTitle}>{sec.title}</span>
                            <span className={s.sectionMeta}>{sec.meta}</span>
                            <span className={s.plusMinus} aria-hidden="true" />
                          </button>
                        </h3>
                        <div id={`${uid}-${sec.id}`} className={s.sectionPanel} hidden={!isOpen}>
                          <p>{sec.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            )}
            {running ? <span className="visually-hidden">Keplar is working</span> : null}
          </div>

          <div className={s.composer} aria-hidden="true">
            <span className={s.composerInput}>Ask a follow-up…</span>
            <div className={s.composerRow}>
              <div className={s.tools}>
                {composerTools.map((t) => (
                  <span key={t} className={s.tool}>
                    {t}
                  </span>
                ))}
              </div>
              <span className={s.ask}>Ask Keplar →</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
